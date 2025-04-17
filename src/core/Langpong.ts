// Langpong.ts
import express from "express";
import { ManagerStore } from "./ManagerStore"; 
import { getPlugin, getPlugins, PluginConfigs } from "langcode";

export interface LangpongOptions {
  port?: number;
  host?: string;
  managerStore?: ManagerStore;  
}

/** 
 * Langpong 
 *  - Express.js uygulamasını bir class olarak sarar
 *  - Port ve host dışarıdan alınır
 *  - ManagerStore'u kullanıp endpoint'leri tanımlar
 */
export class Langpong {
  private app = express();
  private serverInstance: any;   // http.Server tipinde tutabiliriz
  private port: number;
  private host: string;
  private store: ManagerStore;

  constructor(options: LangpongOptions = {}) {
    // Varsayılan değerler
    this.port = options.port || (process.env.PORT ? parseInt(process.env.PORT) : 3000);
    this.host = options.host || process.env.HOST || "127.0.0.1";

    // eğer store dışarıdan verilmemişse singleton alır
    this.store = options.managerStore || ManagerStore.getInstance({
      logLevel: "debug",
      // vb. 
    });

    // Express middleware
    this.app.use(express.json());

    // Yönlendirmeleri kuralım
    this.initializeRoutes();
  }

  /** 
   * Tüm API uç noktalarını tanımlayalım 
   */
  private initializeRoutes() {
    // 1) Manager init
    this.app.post("/init", async (req, res) => {
      try {
        const {  pluginConfigs } = req.body as {
          sessionId: string;
          pluginConfigs: PluginConfigs[];
        };
        const sid = await this.store.createManagerAsync( pluginConfigs);
        res.json({ success: true, sessionID:sid, message: "Manager created or initializing." });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.error.message,history:err.history });
      }
    });

    // 2) runPlugin
    this.app.post("/runPlugin", async (req, res) => {
      try {
        const { sessionId, pluginName, pluginParams } = req.body;
        const result = await this.store.runPlugin(sessionId, pluginName, pluginParams);
        res.json({ success: true, result });
      } catch (err: any) {
        res.status(400).json({ success: false,  error: err.error,history:err.history});
      }
    });

    this.app.post("/getPlugin", async (req, res) => {
      try {
        const {  pluginName } = req.body;
        const result = await this.store.getPlugin(pluginName)
        res.json({ success: true, result });
      } catch (err: any) {
        res.status(400).json({ success: false,  error: err.error,history:err.history});
      }
    });

    this.app.post("/getPlugins", async (req, res) => {
      try {
        const result = await this.store.getPlugins()
        res.json({ success: true, result });
      } catch (err: any) {
        res.status(400).json({ success: false,  error: err.error,history:err.history});
      }
    });
    // 3) createChain
    this.app.post("/createChain", (req, res) => {
      try {
        const { sessionId, chainId, chainConfig } = req.body;
        this.store.createChain(sessionId, chainId, chainConfig);
        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // 4) runChain
    this.app.post("/runChain", async (req, res) => {
      try {
        const { sessionId, chainId, input } = req.body;
        const result = await this.store.runChain(sessionId, chainId, input);
        res.json({ success: true, result });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // 5) removeManager
    this.app.post("/removeManager", (req, res) => {
      try {
        const { sessionId } = req.body;
        const removed = this.store.removeManager(sessionId);
        res.json({ success: removed });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // 6) sharedMemory
    this.app.post("/putSharedData", (req, res) => {
      try {
        const { sessionId, key, data } = req.body;
        this.store.putSharedData(sessionId, key, data);
        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    this.app.post("/getSharedData", (req, res) => {
      try {
        const { sessionId, key } = req.body;
        const value = this.store.getSharedData(sessionId, key);
        res.json({ success: true, value });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // 7) listManagers
    this.app.post("/listManagers", (req, res) => {
      const data = this.store.listActiveManagers();
      res.json({ success: true, data });
    });

    // 8) shutdownAll
    this.app.post("/shutdownAll", (req, res) => {
      this.store.shutdownAllManagers();
      res.json({ success: true });
    });
  }

  /** 
   * Sunucuyu başlat 
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.serverInstance = this.app.listen(this.port, this.host, () => {
        console.log(`Langpong running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /** 
   * Sunucuyu kapat (opsiyonel) 
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serverInstance) {
        this.serverInstance.close((err: any) => {
          if (err) return reject(err);
          console.log("Langpong stopped.");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}