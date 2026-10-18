import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }
  return result;
}

function readLocalEnvFiles() {
  // Load from the least specific source to the most specific source. Runtime
  // process environment variables still take precedence over every file.
  const directories = [
    packageRoot,
    process.env.MIFFY_VIDEO_INTEL_HOME,
    process.env.MIFFY_CONFIG_HOME,
    process.cwd(),
  ].filter(Boolean);
  const files = directories.map((directory) => path.resolve(directory, ".env"));
  const result = {};

  for (const file of [...new Set(files)]) {
    Object.assign(result, parseEnvFile(file));
  }
  return result;
}

export function loadConfig({ requireFeishu = true } = {}) {
  const local = readLocalEnvFiles();
  const value = (key) => {
    const result = process.env[key] || local[key] || "";
    return /^replace_with_/i.test(result) ? "" : result;
  };

  const config = {
    appId: value("FEISHU_APP_ID"),
    appSecret: value("FEISHU_APP_SECRET"),
    baseId: value("FEISHU_BASE_ID"),
    tableId: value("FEISHU_TABLE_ID"),
    chatId: value("FEISHU_CHAT_ID"),
    baseUrl: value("FEISHU_BASE_URL"),
    botName: value("MIFFY_BOT_NAME") || "Miffy",
    defaultAgent: value("MIFFY_DEFAULT_AGENT") || "Agent",
    defaultModel: value("MIFFY_DEFAULT_MODEL") || "",
  };

  if (requireFeishu) {
    const required = [
      ["FEISHU_APP_ID", config.appId],
      ["FEISHU_APP_SECRET", config.appSecret],
      ["FEISHU_BASE_ID", config.baseId],
      ["FEISHU_TABLE_ID", config.tableId],
    ];
    const missing = required.filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) {
      throw new Error(`Missing Feishu config: ${missing.join(", ")}`);
    }
  }
  return config;
}
