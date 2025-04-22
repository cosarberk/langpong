#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { Langpong } from "../core/Langpong";
import { ManagerStore } from "../core/ManagerStore";
import { ManagerStoreOptions } from "../types";

const program = new Command();

program
  .name("Langpong")
  .description("CLI to launch the Langcode Api Server")
  .version("1.0.7");

// Burada kısa isimleri ekliyoruz:
// -c => --config
// -p => --port
// -h => --host
program
  .option("-c, --config <path>", "Path to config JSON/YAML file")
  .option("-p, --port <number>", "Port number", process.env.PORT)
  .option("-H, --host <string>", "Host/IP address", process.env.HOST)
  .option("--maxConcurrentRunsPerManager <number>", "Manager concurrency limit")
  .option("--maxConcurrentRunsGlobal <number>", "Global concurrency limit")
  .option("--logLevel <level>", "Log level (info, debug, error)", process.env.LOG_LEVEL);

program.parse(process.argv);
const cliOpts = program.opts();

// Örnek varsayılan config
const defaultConfig = {
  manager: {
    maxConcurrentRunsPerManager: 3,
    maxConcurrentRunsGlobal: 10,
    maxIdleTimeMs: 600000,     
    maxLifeTimeMs: 3600000,   
    cleanupIntervalMs: 60000,
    logsDir: "./logs",
    logLevel: "info",
  },
  server: {
    port: 4321,
    host: "0.0.0.0",
  },
  pluginsDefault: [],
};

// Basit derin merge fonksiyonu
function deepMerge(target: any, source: any): any {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// 1) Başlangıç: default config
let mergedConfig = deepMerge({}, defaultConfig);

// 2) Dosyadan yükleme
if (cliOpts.config) {
  try {
    const raw = fs.readFileSync(path.resolve(cliOpts.config), "utf-8");
    const fileConfig = JSON.parse(raw);
    mergedConfig = deepMerge(mergedConfig, fileConfig);
  } catch (err) {
    console.error("Failed to load config file:", err);
    process.exit(1);
  }
}

// 3) CLI parametrelerini override
if (cliOpts.port) mergedConfig.server.port = parseInt(cliOpts.port, 10);
if (cliOpts.host) mergedConfig.server.host = cliOpts.host;
if (cliOpts.maxConcurrentRunsPerManager) {
  mergedConfig.manager.maxConcurrentRunsPerManager = parseInt(cliOpts.maxConcurrentRunsPerManager, 10);
}
if (cliOpts.maxConcurrentRunsGlobal) {
  mergedConfig.manager.maxConcurrentRunsGlobal = parseInt(cliOpts.maxConcurrentRunsGlobal, 10);
}
if (cliOpts.logLevel) {
  mergedConfig.manager.logLevel = cliOpts.logLevel;
}

// Nihai parametrelerle ManagerStore & Server
const finalManagerOpts: ManagerStoreOptions = mergedConfig.manager;
const finalServerOpts = mergedConfig.server;

const store = ManagerStore.getInstance(finalManagerOpts);
const server = new Langpong({
  port: finalServerOpts.port,
  host: finalServerOpts.host,
  managerStore: store,
});

server.start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});