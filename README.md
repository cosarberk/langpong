# langpong
langcode api server version




# Langpong CLI

Langpong CLI is a command-line interface tool designed to launch and configure the Langcode API Server. It supports flexible runtime configurations through CLI flags and external config files, making it easy to tailor deployments for various environments.

---

## 🚀 Getting Started

### Installation
```bash
npm install -g langpong-cli
```

### Usage
```bash
langpong [options]
```

---

## ⚙️ CLI Options

| Option                              | Alias | Description                                                  | Default              |
|-------------------------------------|-------|--------------------------------------------------------------|----------------------|
| `--config <path>`                  | `-c`  | Path to a JSON/YAML config file                              | `null`               |
| `--port <number>`                  | `-p`  | Port number for the API server                               | `process.env.PORT`   |
| `--host <string>`                  | `-H`  | Host/IP address                                              | `process.env.HOST`   |
| `--maxConcurrentRunsPerManager`    |       | Max parallel runs per plugin manager                        | `3`                  |
| `--maxConcurrentRunsGlobal`        |       | Max parallel runs globally across all managers              | `10`                 |
| `--logLevel <level>`               |       | Logging level (`info`, `debug`, `error`)                    | `info`               |

---

## 📄 Configuration File

You can optionally provide a configuration file using `--config`. It should be in JSON format and match the structure below:

```json
{
  "manager": {
    "maxConcurrentRunsPerManager": 3,
    "maxConcurrentRunsGlobal": 10,
    "maxIdleTimeMs": 600000,
    "maxLifeTimeMs": 3600000,
    "cleanupIntervalMs": 60000,
    "logsDir": "./logs",
    "logLevel": "info"
  },
  "server": {
    "port": 3000,
    "host": "127.0.0.1"
  },
  "pluginsDefault": []
}
```

Any CLI arguments will override the values provided in the configuration file.

---

## 🧠 Architecture Overview

- **ManagerStore**: Handles plugin concurrency, lifecycle, and logging.
- **Langpong**: Responsible for starting the HTTP server with specified host and port, and delegating tasks to the ManagerStore.
- **Deep Merge Strategy**: Default config is extended first with the config file (if any), then finally overridden by CLI options.

---

## 🛠️ Development

Clone the project and link it globally for development:

```bash
git clone https://github.com/your-org/langpong-cli.git
cd langpong-cli
npm install
npm link
```

Run using:
```bash
langpong -c ./config.json
```

---

## 🧪 Example

```bash
langpong -p 8080 -H 0.0.0.0 --maxConcurrentRunsPerManager 5 --logLevel debug
```

This command starts the server on port 8080, accessible on all interfaces, with concurrency and logging settings customized.

---

## 📦 Version

**Current Version**: `1.0.3`

---

## 📧 Support

For bug reports, suggestions, or feature requests, please open an issue on the [GitHub repository](https://github.com/your-org/langpong-cli/issues).

---

## 📝 License

MIT License. See `LICENSE` file for details.

