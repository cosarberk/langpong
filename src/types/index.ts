import { Langcode, plugins } from "langcode";

// ==== Chain Arayüzü / Tipi ====
export interface Chain {
  run(input: any): Promise<any>;
}

export interface ChainConfig {
  type: string; // "LLM", "SQL", vb.
  options?: Record<string, any>;
}

// ==== Manager Durumları ====
export type ManagerStatus = "INITIALIZING" | "READY";


// Plugin çalıştırma task verileri
export interface PluginRunTask {
  type: "PLUGIN_RUN";
  pluginName: plugins;
  pluginParams: any;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

// Chain çalıştırma task verileri
export interface ChainRunTask {
  type: "CHAIN_RUN";
  chainId: string;
  input: any;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

export type ManagerTask = PluginRunTask | ChainRunTask;

/** ManagerEntry: manager + meta veriler + chain'ler + paylaşılan data + run queue + vs. */
export interface ManagerEntry {
  sessionId: string;

  manager: Langcode | null;
  status: ManagerStatus;
  createdAt: number;
  lastUsedAt: number;

  // concurrency
  activeRunsCount: number;

  // run queue
  taskQueue: ManagerTask[]; // FIFO kuyruk

  // chain
  chains: Map<string, Chain>;
  chainOutputs: Map<string, any>;

  // paylaşımlı bellek
  sharedMemory: Record<string, any>;

  // Faiss vb. bir index örneği (doldurulup init edilebilir).
  faissIndex: any; // tip yoksa any diyelim
}

export interface ManagerStoreOptions {
  maxConcurrentRunsPerManager?: number;
  maxConcurrentRunsGlobal?: number;

  maxIdleTimeMs?: number;
  maxLifeTimeMs?: number;

  // Temizlik mekaniği
  cleanupIntervalMs?: number; // reaktifte de kullanabiliriz

  logsDir?: string;
  logLevel?: string;
}
