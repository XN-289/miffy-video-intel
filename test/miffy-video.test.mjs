import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { normalizeUrl, recordToFields } from "../src/feishu.mjs";
import { validateRecord } from "../src/validator.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

test("complete example passes schema validation", () => {
  const result = validateRecord(readJson("templates/video-analysis.example.json"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("blocked example passes schema validation", () => {
  const result = validateRecord(readJson("templates/blocked-video.example.json"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("complete analysis requires transcript or visual evidence", () => {
  const record = readJson("templates/video-analysis.example.json");
  delete record.video.content.transcript;
  delete record.video.content.visual_notes;
  const result = validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("video.content")));
});

test("URL normalization removes tracking and access parameters", () => {
  const normalized = normalizeUrl(
    "https://www.xiaohongshu.com/explore/abc?xsec_token=secret&utm_source=chat&keep=1"
  );
  assert.equal(normalized, "https://www.xiaohongshu.com/explore/abc?keep=1");
});

test("recordToFields maps key information to Feishu fields", () => {
  const record = readJson("templates/video-analysis.example.json");
  const fields = recordToFields(record, { defaultAgent: "Codex", defaultModel: "test-model" });
  assert.equal(fields["视频链接"].link, record.video.url);
  assert.equal(fields["平台"], "其他");
  assert.equal(fields["钩子强度"], record.analysis.scores.hook_strength);
  assert.equal(fields["采集Agent"], "Muse");
  assert.equal(fields["模型"], "example-model");
  assert.ok(fields["建议拍摄脚本"].includes("35 秒"));
});

test("blocked records remain explicit intake tasks", () => {
  const record = readJson("templates/blocked-video.example.json");
  const fields = recordToFields(record, { defaultAgent: "Codex" });
  assert.equal(fields["采集状态"], "受限待补充");
  assert.ok(fields["风险与待验证"].includes("视频截图或录屏"));
  assert.equal(fields["开头钩子"], "");
});

test("CLI dry-run does not require Feishu credentials", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["bin/miffy-video.mjs", "upsert", "templates/video-analysis.example.json", "--dry-run"],
    { cwd: root, env: { ...process.env, FEISHU_APP_ID: "", FEISHU_APP_SECRET: "" } }
  );
  const output = JSON.parse(stdout);
  assert.equal(output[0].action, "dry-run");
  assert.ok(output[0].fields["视频链接"]);
});

test("CLI can find Feishu config outside the repository", async () => {
  const originalCwd = process.cwd();
  const originalConfigHome = process.env.MIFFY_CONFIG_HOME;
  const originalProjectHome = process.env.MIFFY_VIDEO_INTEL_HOME;
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(root), "miffy-config-"));
  const redactedValues = {
    FEISHU_APP_ID: "",
    FEISHU_APP_SECRET: "",
    FEISHU_BASE_ID: "",
    FEISHU_TABLE_ID: "",
    FEISHU_CHAT_ID: "",
  };

  try {
    fs.writeFileSync(
      path.join(temporaryDirectory, ".env"),
      [
        "FEISHU_APP_ID=config-home-app",
        "FEISHU_APP_SECRET=config-home-secret",
        "FEISHU_BASE_ID=config-home-base",
        "FEISHU_TABLE_ID=config-home-table",
      ].join("\n"),
      "utf8"
    );
    process.chdir(temporaryDirectory);
    process.env.MIFFY_CONFIG_HOME = temporaryDirectory;
    process.env.MIFFY_VIDEO_INTEL_HOME = root;
    for (const [key, value] of Object.entries(redactedValues)) process.env[key] = value;

    const { stdout } = await execFileAsync(process.execPath, [path.join(root, "bin/miffy-video.mjs"), "doctor"], {
      cwd: temporaryDirectory,
      env: { ...process.env, ...redactedValues },
    });
    const output = JSON.parse(stdout);
    assert.equal(output.feishu_app_id, true);
    assert.equal(output.feishu_app_secret, true);
    assert.equal(output.feishu_base_id, true);
    assert.equal(output.feishu_table_id, true);
  } finally {
    process.chdir(originalCwd);
    if (originalConfigHome === undefined) delete process.env.MIFFY_CONFIG_HOME;
    else process.env.MIFFY_CONFIG_HOME = originalConfigHome;
    if (originalProjectHome === undefined) delete process.env.MIFFY_VIDEO_INTEL_HOME;
    else process.env.MIFFY_VIDEO_INTEL_HOME = originalProjectHome;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
