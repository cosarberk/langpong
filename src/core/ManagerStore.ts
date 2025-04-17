/**
 * ManagerStore.ts
 */

import { EventEmitter } from "events";
import winston from "winston";
import { v4 as uuidv4 } from "uuid";

import jwt from "jsonwebtoken";
import { getPlugin, getPlugins, langcode,Langcode,PluginConfigs, PluginDescriptions, plugins } from "langcode";
import { Chain, ChainConfig, ChainRunTask, ManagerEntry, ManagerStoreOptions, ManagerTask, PluginRunTask } from "../types";

// Bu projenin gerçeğinde muhtemelen .env / config üzerinden SECRET alacaksın
const JWT_SECRET = "SUPER_SECRET_KEY"; // DEMO için sabit


/**
 * Gelişmiş ManagerStore:
 * - Manager bazında run queue
 * - INITIALIZING durumunda gelen run'ları da kuyrukluyor.
 * - JWT tabanlı "session ownership" kontrolü örneği
 * - Faiss index i manager'a dahil etme
 */
export class ManagerStore extends EventEmitter {
  private static instance: ManagerStore;

  private managers = new Map<string, ManagerEntry>();

  private currentGlobalRuns = 0;

  private logger: winston.Logger;
  private options: Required<ManagerStoreOptions>;

  private nextCleanupTimeout: NodeJS.Timeout | null = null;

  public static getInstance(opts?: ManagerStoreOptions): ManagerStore {
    if (!this.instance) {
      this.instance = new ManagerStore(opts);
    }
    return this.instance;
  }

  private constructor(opts?: ManagerStoreOptions) {
    super();
    const defaults: Required<ManagerStoreOptions> = {
      maxConcurrentRunsPerManager: 3,
      maxConcurrentRunsGlobal: 10,
      maxIdleTimeMs: 10 * 60 * 1000,
      maxLifeTimeMs: 60 * 60 * 1000,
      cleanupIntervalMs: 60 * 1000,
      logsDir: "./logs",
      logLevel: "info",
    };
    this.options = { ...defaults, ...opts };

    this.logger = winston.createLogger({
      level: this.options.logLevel,
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
        new winston.transports.File({
          filename: `${this.options.logsDir}/manager_store.log`,
          maxsize: 10 * 1024 * 1024,
          maxFiles: 5,
        }),
      ],
    });

    this.on("runComplete", () => {
      this.processQueueAll(); // bir run tamamlanınca tekrar kuyruğu dene (boş slot açıldı)
      this.scheduleNextCleanup();
    });
    this.on("managerCreated", () => {
      this.scheduleNextCleanup();
    });
    this.on("managerReady", () => {
      // manager INITIALIZING'den READY'e geçtiyse, oradaki queue'daki işleri çalıştırabiliriz
      this.processQueueAll();
      this.scheduleNextCleanup();
    });
  }

  /**
   * Basit JWT doğrulama örneği: 
   * - request'ten token al
   * - decode et
   * - userId'yi döndür
   * Gerçekte try/catch ile de verify yapmalısınız.
   */
  public decodeJWT(token: string): { userId: string } {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload;
  }

  /**
   * Session'ın sahibi, bu userId mi?
   */
  private checkSessionOwnership(sessionId: string, userId: string): void {
    const entry = this.managers.get(sessionId);
    if (!entry) {
      throw new Error(`No manager for sessionId=${sessionId}`);
    }
  
  }

  /**
   * createManagerAsync: FAISS index vb. gibi ağır init senaryolarını taklit ediyor
   */
  public async createManagerAsync(pluginConfigs: PluginConfigs[]): Promise<string> {
 
    let sessionId: string;
    do {
      sessionId = uuidv4();
    } while (this.managers.has(sessionId)); 
  
    const now = Date.now();
    const entry: ManagerEntry = {
      sessionId,
      manager: null,
      status: "INITIALIZING",
      createdAt: now,
      lastUsedAt: now,
      activeRunsCount: 0,
      taskQueue: [],
      chains: new Map(),
      chainOutputs: new Map(),
      sharedMemory: {},
      faissIndex: null
    };
  
    this.managers.set(sessionId, entry);
    this.logger.info(`ManagerEntry created (INITIALIZING): ${sessionId}`);
  
    try {
      const manager = await langcode(pluginConfigs,{debug:false,strict:true,logFile:"./logs/langcode.log"});
      entry.faissIndex = { ready: true };
  
      entry.manager = manager;
      entry.status = "READY";
      this.logger.info(`Manager is READY now: ${sessionId}`);
    } catch (err) {
      this.logger.error(`Manager init failed: sessionId=${sessionId}, err=${String(err)}`);
      this.managers.delete(sessionId);
      console.log(err)
      throw err
    }
  
    this.emit("managerCreated", sessionId);
    this.emit("managerReady", sessionId);
  
    return sessionId;
  }

  /**
   * getManager
   */
  public getManager(sessionId: string): Langcode | undefined {


    const entry = this.managers.get(sessionId);
    if (!entry) return undefined;
    entry.lastUsedAt = Date.now();
    if (entry.status !== "READY" || !entry.manager) return undefined;
    return entry.manager;
  }

  /**
   * ManagerEntry'ye doğrudan erişmek istersen
   */
  public getManagerEntry(sessionId: string): ManagerEntry | undefined {


    const entry = this.managers.get(sessionId);
    if (entry) {
      entry.lastUsedAt = Date.now();
    }
    return entry;
  }

  /**
   * removeManager
   */
  public removeManager(sessionId: string): boolean {


    const removed = this.managers.delete(sessionId);
    if (removed) {
      this.logger.info(`Manager removed: ${sessionId}`);
    }
    return removed;
  }

  public async getPlugin(pluginName: plugins): Promise<PluginDescriptions | null>{
        return await getPlugin(pluginName)
  }

  public async getPlugins(): Promise<PluginDescriptions[]>{
        return await getPlugins()

  }

  /**
   * Plugin run talebi -> Kuyruğa eklenir veya hemen işlenir
   */
  public async runPlugin(sessionId: string, pluginName: plugins, pluginParams: any): Promise<any> {
    // const { userId } = this.decodeJWT(userToken);
    // this.checkSessionOwnership(sessionId, userId);

    return new Promise<any>((resolve, reject) => {
      const entry = this.managers.get(sessionId);
      if (!entry) {
        return reject({error:`No manager found for sessionId=${sessionId}`});
      }

      // Bir task oluştur
      const task: PluginRunTask = {
        type: "PLUGIN_RUN",
        pluginName,
        pluginParams,
        resolve,
        reject,
      };
      // Kuyruğa ekle
      entry.taskQueue.push(task);

      // Kuyruk işlenmeye çalışılsın
      this.processQueue(sessionId);
    });
  }

  /**
   * Chain run
   */
  public async runChain(sessionId: string, chainId: string, input: any): Promise<any> {
    // const { userId } = this.decodeJWT(userToken);
    // this.checkSessionOwnership(sessionId, userId);

    return new Promise<any>((resolve, reject) => {
      const entry = this.managers.get(sessionId);
      if (!entry) {
        return reject(new Error(`No manager found for sessionId=${sessionId}`));
      }

      const task: ChainRunTask = {
        type: "CHAIN_RUN",
        chainId,
        input,
        resolve,
        reject,
      };
      entry.taskQueue.push(task);

      this.processQueue(sessionId);
    });
  }

  /**
   * CHAIN oluşturma
   */
  public createChain(sessionId: string, chainId: string, config: ChainConfig): Chain {
    // const { userId } = this.decodeJWT(userToken);
    // this.checkSessionOwnership(sessionId, userId);

    const entry = this.managers.get(sessionId);
    if (!entry) {
      throw new Error(`No manager found for sessionId=${sessionId}`);
    }
    // Basit chain mock
    const chain: Chain = {
      async run(input: any) {
        // Burada manager veya faissIndex vs. erişilebilir
        // entry.faissIndex.search(...) vs. (örnek)
        return {
          chainType: config.type,
          input,
        };
      },
    };

    entry.chains.set(chainId, chain);
    this.logger.info(`Chain created: ${chainId}, for session=${sessionId}`);
    return chain;
  }

  public getChainOutput(sessionId: string, chainId: string): any {

    const entry = this.managers.get(sessionId);
    if (!entry) return undefined;
    return entry.chainOutputs.get(chainId);
  }

  public putSharedData(sessionId: string, key: string, data: any) {
;

    const entry = this.managers.get(sessionId);
    if (!entry) {
      throw new Error(`No manager found for sessionId=${sessionId}`);
    }
    entry.sharedMemory[key] = data;
  }

  public getSharedData(sessionId: string, key: string): any {


    const entry = this.managers.get(sessionId);
    if (!entry) return undefined;
    return entry.sharedMemory[key];
  }

  /**
   * Kuyruktaki işleri işlemeye çalışır.
   * - Manager "READY" mi?
   * - Concurrency limitleri uygun mu?
   * Uygunsa 1 task çekip çalıştırır, bitince "runComplete" event'ine yol açar.
   * Tek seferde birden çok task'ı da (kullanımdaki concurrency limitine bağlı olarak) ilerletebilirsin.
   */
  private processQueue(sessionId: string) {
    const entry = this.managers.get(sessionId);
    if (!entry) return;

    // Manager READY değilse return (kuyrukta beklemeye devam)
    if (entry.status !== "READY" || !entry.manager) {
      return;
    }

    // Şu anda manager concurrency dolu mu?
    while (
      entry.taskQueue.length > 0 &&
      entry.activeRunsCount < this.options.maxConcurrentRunsPerManager &&
      this.currentGlobalRuns < this.options.maxConcurrentRunsGlobal
    ) {
      // bir task çek
      const task = entry.taskQueue.shift()!;
      // çalıştır
      this.executeTask(entry, task);
    }
  }

  /**
   * Bütün managerların kuyruğunu işleyebilir.
   * Bir run bittiğinde global concurrency düşer => başka managerlardaki kuyruklar da ilerleyebilir.
   */
  private processQueueAll() {
    for (const sessionId of this.managers.keys()) {
      this.processQueue(sessionId);
    }
  }

  /**
   * Tekil bir task'ı hayata geçirir.
   */
  private async executeTask(entry: ManagerEntry, task: ManagerTask) {
    entry.lastUsedAt = Date.now();

    // concurrency slot al
    entry.activeRunsCount++;
    this.currentGlobalRuns++;

    const sessionId = entry.sessionId;

    try {
      if (task.type === "PLUGIN_RUN") {
        this.logger.debug(`executeTask(PLUGIN_RUN) start: sessionId=${sessionId}, plugin=${task.pluginName}`);

        const result = await entry.manager!.run(task.pluginName, task.pluginParams);

        this.logger.info(`executeTask(PLUGIN_RUN) success: sessionId=${sessionId}, plugin=${task.pluginName}`);
        task.resolve(result);
      } else if (task.type === "CHAIN_RUN") {
        this.logger.debug(`executeTask(CHAIN_RUN) start: sessionId=${sessionId}, chainId=${task.chainId}`);
        const chain = entry.chains.get(task.chainId);
        if (!chain) {
          throw new Error(`No chain found: chainId=${task.chainId}`);
        }

        const result = await chain.run(task.input);
        this.logger.info(`executeTask(CHAIN_RUN) success: sessionId=${sessionId}, chainId=${task.chainId}`);
        entry.chainOutputs.set(task.chainId, result);
        task.resolve(result);
      }
    } catch (err) {
      this.logger.error(`executeTask error: sessionId=${sessionId}, err=${(JSON.stringify(err,null,2))}`);
      task.reject(err);
    } finally {
      entry.activeRunsCount--;
      this.currentGlobalRuns--;

      // Bir "run" bitti, store'a bildirelim
      this.emit("runComplete", sessionId);
    }
  }

  /**
   * Reaktif temizlik (benzer mantık): 
   * Her runComplete ve managerReady sonrasında scheduleNextCleanup.
   */
  private scheduleNextCleanup() {
    if (this.nextCleanupTimeout) {
      clearTimeout(this.nextCleanupTimeout);
    }
    this.nextCleanupTimeout = setTimeout(() => {
      this.cleanupExpiredManagers();
      this.nextCleanupTimeout = null;
    }, this.options.cleanupIntervalMs);
  }

  private cleanupExpiredManagers() {
    const now = Date.now();
    for (const [sessionId, entry] of this.managers.entries()) {
      const idleDuration = now - entry.lastUsedAt;
      const lifeDuration = now - entry.createdAt;
      if (idleDuration > this.options.maxIdleTimeMs || lifeDuration > this.options.maxLifeTimeMs) {
        // Manager'ı kapat
        this.managers.delete(sessionId);
        this.logger.info(
          `Manager cleaned up (expired): ${sessionId}, idleDuration=${idleDuration}, lifeDuration=${lifeDuration}`
        );
      }
    }
  }

  public shutdownAllManagers() {
    this.managers.clear();
    if (this.nextCleanupTimeout) {
      clearTimeout(this.nextCleanupTimeout);
    }
    this.logger.info("All managers have been shut down.");
  }

  /**
   * Debug: aktif manager listesi
   */
  public listActiveManagers() {
    const data = [];
    for (const [sessionId, entry] of this.managers.entries()) {
      data.push({
        sessionId,
        status: entry.status,
        createdAt: entry.createdAt,
        lastUsedAt: entry.lastUsedAt,
        activeRunsCount: entry.activeRunsCount,
        queueLength: entry.taskQueue.length,
        chainCount: entry.chains.size,
        sharedMemoryKeys: Object.keys(entry.sharedMemory).length,
        faissLoaded: entry.faissIndex !== null,
      });
    }
    return data;
  }
}