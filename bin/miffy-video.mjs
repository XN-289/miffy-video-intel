#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.mjs";
import { createClient, initWorkbench, notifyGroup, upsertRecord } from "../src/feishu.mjs";
import { validateRecord } from "../src/validator.mjs";

const USAGE = `miffy-video

Usage:
  miffy-video validate <record.json>...
  miffy-video upsert <record.json>... [--dry-run]
  miffy-video init
  miffy-video doctor

Environment:
  Copy .env.example to .env, then fill Feishu values locally.
`;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  const full = path.resolve(file);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function parseArgs(argv) {
  const command = argv[0];
  const flags = new Set();
  const files = [];
  for (const arg of argv.slice(1)) {
    if (arg === "--dry-run") flags.add("dry-run");
    else files.push(arg);
  }
  return { command, files, flags };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function validateFile(file) {
  const record = readJson(file);
  const result = { file, ...validateRecord(record) };
  printJson(result);
  return result.valid;
}

async function upsertFile(file, dryRun) {
  const record = readJson(file);
  const validation = validateRecord(record);
  if (!validation.valid) {
    throw new Error(`Invalid record ${file}:\n${validation.errors.join("\n")}`);
  }
  const config = loadConfig({ requireFeishu: !dryRun });
  const client = dryRun ? null : createClient(config);
  const result = await upsertRecord(client, config, record, { dryRun, assetBasePath: packageRoot });
  if (!dryRun) await notifyGroup(client, config.chatId, record, result);
  return { file, ...result };
}

async function main() {
  const { command, files, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return;
  }

  if (command === "validate") {
    if (!files.length) throw new Error("validate requires at least one JSON file");
    const allValid = files.every(validateFile);
    if (!allValid) process.exitCode = 1;
    return;
  }

  if (command === "upsert") {
    if (!files.length) throw new Error("upsert requires at least one JSON file");
    const results = [];
    for (const file of files) results.push(await upsertFile(file, flags.has("dry-run")));
    printJson(results);
    return;
  }

  if (command === "init") {
    const config = loadConfig({ requireFeishu: false });
    if (!config.appId || !config.appSecret) throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required");
    const client = createClient(config);
    printJson(await initWorkbench(client, config));
    return;
  }

  if (command === "doctor") {
    const config = loadConfig({ requireFeishu: false });
    printJson({
      node: process.version,
      feishu_app_id: Boolean(config.appId),
      feishu_app_secret: Boolean(config.appSecret),
      feishu_base_id: Boolean(config.baseId),
      feishu_table_id: Boolean(config.tableId),
      feishu_chat_id: Boolean(config.chatId),
      schemas: ["schemas/video-analysis.schema.json", "schemas/blocked-video.schema.json"],
    });
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
