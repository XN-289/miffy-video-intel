import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  fieldDefinitions,
  normalizeUrl,
  notifyGroup,
  recordToFields,
  resolveRecordUrl,
  upsertRecord,
} from "../src/feishu.mjs";
import { buildIntakeRecord, handleGatewayMessage, parseGatewayEvent } from "../src/gateway.mjs";
import { validateRecord } from "../src/validator.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

function writeTinyJpeg(file, width = 1) {
  const height = 1;
  const bytes = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

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

test("transcript-only records cannot claim full video visibility", () => {
  const record = readJson("templates/video-analysis.example.json");
  record.collection.access = "visible";
  record.collection.evidence = [
    { source: "page", quote: "标题展示小浴室收纳方案", confidence: "high" },
    { source: "transcript", quote: "开头直接展示小浴室里的麻烦", confidence: "high" },
  ];
  const result = validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("source video")));
});

test("direct video evidence requires timestamped visual notes", () => {
  const record = readJson("templates/video-analysis.example.json");
  record.video.content.visual_notes = ["画面有冲击力", "产品出现过"];
  const result = validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("timestamped")));
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

test("legacy records without evidence images keep validating", () => {
  const record = readJson("templates/video-analysis.example.json");
  assert.equal(record.video.evidence_images, undefined);
  assert.equal(validateRecord(record).valid, true);
  assert.equal("关键帧证据" in recordToFields(record), false);
  assert.ok(fieldDefinitions().some((field) => field.field_name === "关键帧证据" && field.type === 17 && field.ui_type === "Attachment"));
});

test("dry-run lists evidence images without an upload client", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(path.dirname(root), "miffy-evidence-"));
  try {
    const record = readJson("templates/video-analysis.example.json");
    record.video.evidence_images = [
      {
        path: "analyses/assets/example-video/example-video-0s-opening-hook.jpg",
        timestamp_seconds: 0,
        label: "开场帧证明前3秒的视觉钩子",
      },
    ];
    writeTinyJpeg(path.join(temporaryRoot, record.video.evidence_images[0].path));

    const result = await upsertRecord(null, {}, record, { dryRun: true, assetBasePath: temporaryRoot });
    assert.equal(result.action, "dry-run");
    assert.equal(result.attachments.will_upload.length, 1);
    assert.deepEqual(result.attachments.failed, []);
    assert.equal(result.attachments.will_upload[0].width, 1);
    assert.equal("关键帧证据" in result.fields, false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("upsert uploads key frames and replaces the whole attachment set", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(path.dirname(root), "miffy-evidence-"));
  const uploads = [];
  const updates = [];
  const fieldNames = fieldDefinitions().map((field) => field.field_name);
  const client = {
    bitable: {
      appTableField: {
        list: async () => ({
          code: 0,
          data: { has_more: false, items: fieldNames.map((name) => ({ field_name: name })) },
        }),
      },
      appTableRecord: {
        search: async () => ({
          code: 0,
          data: {
            has_more: false,
            items: [{ record_id: "rec_1", fields: { 视频链接: "https://www.example.com/video" } }],
          },
        }),
        update: async (payload) => {
          updates.push(payload);
          return { code: 0, data: { record: { record_id: "rec_1", record_url: "https://example.com/rec_1" } } };
        },
      },
    },
    drive: {
      media: {
        uploadAll: async (payload) => {
          uploads.push(payload);
          return { file_token: `token_${uploads.length}` };
        },
      },
    },
  };

  try {
    const record = readJson("templates/video-analysis.example.json");
    record.video.evidence_images = [
      { path: "analyses/assets/example-video/example-video-0s-opening-hook.jpg", timestamp_seconds: 0, label: "开场帧证明前3秒的视觉钩子" },
      { path: "analyses/assets/example-video/example-video-30s-closing-cta.jpg", timestamp_seconds: 30, label: "结尾帧证明转化指令" },
    ];
    for (const image of record.video.evidence_images) writeTinyJpeg(path.join(temporaryRoot, image.path));

    const config = { baseId: "base_1", tableId: "table_1" };
    const first = await upsertRecord(client, config, record, { assetBasePath: temporaryRoot });
    const second = await upsertRecord(client, config, record, { assetBasePath: temporaryRoot });

    assert.equal(uploads.length, 4);
    assert.equal(first.attachments.uploaded.length, 2);
    assert.equal(second.attachments.uploaded.length, 2);
    assert.deepEqual(updates[0].data.fields["关键帧证据"], [{ file_token: "token_1" }, { file_token: "token_2" }]);
    assert.deepEqual(updates[1].data.fields["关键帧证据"], [{ file_token: "token_3" }, { file_token: "token_4" }]);
    assert.equal(updates[1].data.fields["关键帧证据"].length, 2);
    for (const upload of uploads) {
      assert.equal(upload.data.parent_type, "bitable_file");
      assert.equal(upload.data.parent_node, "base_1");
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("a failed image upload does not block the text record", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(path.dirname(root), "miffy-evidence-"));
  const updates = [];
  const fieldNames = fieldDefinitions().map((field) => field.field_name);
  const client = {
    bitable: {
      appTableField: {
        list: async () => ({
          code: 0,
          data: { has_more: false, items: fieldNames.map((name) => ({ field_name: name })) },
        }),
      },
      appTableRecord: {
        search: async () => ({
          code: 0,
          data: { has_more: false, items: [{ record_id: "rec_1", fields: { 视频链接: "https://www.example.com/video" } }] },
        }),
        update: async (payload) => {
          updates.push(payload);
          return { code: 0, data: { record: { record_id: "rec_1", record_url: "https://example.com/rec_1" } } };
        },
      },
    },
    drive: {
      media: {
        uploadAll: async ({ data }) => {
          if (data.file_name.includes("-30s-")) throw new Error("Permission denied");
          return { file_token: "token_ok" };
        },
      },
    },
  };

  try {
    const record = readJson("templates/video-analysis.example.json");
    record.video.evidence_images = [
      { path: "analyses/assets/example-video/example-video-0s-opening-hook.jpg", timestamp_seconds: 0, label: "开场帧证明前3秒的视觉钩子" },
      { path: "analyses/assets/example-video/example-video-30s-closing-cta.jpg", timestamp_seconds: 30, label: "结尾帧证明转化指令" },
    ];
    for (const image of record.video.evidence_images) writeTinyJpeg(path.join(temporaryRoot, image.path));

    const result = await upsertRecord(client, { baseId: "base_1", tableId: "table_1" }, record, { assetBasePath: temporaryRoot });
    assert.equal(result.action, "updated");
    assert.deepEqual(updates[0].data.fields["关键帧证据"], [{ file_token: "token_ok" }]);
    assert.equal(result.attachments.failed.length, 1);
    assert.match(result.attachments.failed[0].reason, /上传、下载云文档素材/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("blocked records remain explicit intake tasks", () => {
  const record = readJson("templates/blocked-video.example.json");
  const fields = recordToFields(record, { defaultAgent: "Codex" });
  assert.equal(fields["采集状态"], "受限待补充");
  assert.ok(fields["风险与待验证"].includes("视频截图或录屏"));
  assert.equal(fields["开头钩子"], "");
});

test("record links and group notifications are actionable", async () => {
  const messages = [];
  const client = {
    im: {
      message: {
        create: async (payload) => {
          messages.push(payload);
          return { code: 0 };
        },
      },
    },
  };
  const record = readJson("templates/video-analysis.example.json");
  const result = {
    action: "updated",
    record_id: "rec_missing_url",
    record_url: resolveRecordUrl({ baseId: "base_1", tableId: "table_1" }, "rec_missing_url", ""),
    attachments: {
      uploaded: [{ file_token: "token_1" }],
      failed: [{ reason: "上传失败：请给飞书应用开通「上传、下载云文档素材」权限" }],
    },
  };

  assert.equal(result.record_url, "https://www.feishu.cn/base/base_1?table=table_1&record=rec_missing_url");
  assert.equal(await notifyGroup(client, "chat_1", record, result), true);
  const content = JSON.parse(messages[0].data.content).text;
  assert.match(content, /已更新（分析完成）/);
  assert.match(content, /视频：https:\/\/www\.example\.com\/video/);
  assert.match(content, /record=rec_missing_url/);
  assert.match(content, /成功 1 张 \/ 失败 1 张/);
  assert.match(content, /上传、下载云文档素材/);
});

function gatewayEvent(text, { mentions = [] } = {}) {
  return {
    sender: { sender_type: "user" },
    message: {
      message_id: "om_1",
      chat_id: "chat_1",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text }),
      mentions,
    },
  };
}

test("gateway parses mentions and answers an existing link lookup", async () => {
  const messages = [];
  const searches = [];
  const client = {
    bitable: {
      appTableRecord: {
        search: async (payload) => {
          searches.push(payload);
          return {
            code: 0,
            data: {
              has_more: false,
              items: [{
                record_id: "rec_1",
                fields: {
                  视频链接: { text: "示例", link: "https://www.example.com/video" },
                  标题: "示例记录",
                  采集状态: "Agent可见",
                  分析置信度: "高",
                  综合潜力: 5,
                  更新时间: 1792330979929,
                  采集Agent: "Muse",
                },
              }],
            },
          };
        },
      },
    },
    im: {
      message: {
        create: async (payload) => {
          messages.push(payload);
          return { code: 0 };
        },
      },
    },
  };
  const event = gatewayEvent("@_user_1 查 https://www.example.com/video?xsec_token=secret", {
    mentions: [{ key: "@_user_1", name: "Miffy" }],
  });
  const parsed = parseGatewayEvent(event, "Miffy");
  assert.equal(parsed.text, "查 https://www.example.com/video?xsec_token=secret");
  assert.equal(await handleGatewayMessage(event, { client, config: { baseId: "base_1", tableId: "table_1", botName: "Miffy" } }), true);
  assert.deepEqual(searches[0].data, {});
  const reply = JSON.parse(messages[0].data.content).text;
  assert.match(reply, /已找到同链接记录/);
  assert.match(reply, /记录：https:\/\/www\.feishu\.cn\/base\/base_1\?table=table_1&record=rec_1/);
});

test("gateway creates one blocked intake task for a new link", async () => {
  const messages = [];
  const created = [];
  const fieldNames = fieldDefinitions().map((field) => field.field_name);
  const client = {
    bitable: {
      appTableField: {
        list: async () => ({
          code: 0,
          data: { has_more: false, items: fieldNames.map((name) => ({ field_name: name })) },
        }),
      },
      appTableRecord: {
        search: async () => ({ code: 0, data: { has_more: false, items: [] } }),
        create: async (payload) => {
          created.push(payload);
          return { code: 0, data: { record: { record_id: "rec_new" } } };
        },
      },
    },
    im: {
      message: {
        create: async (payload) => {
          messages.push(payload);
          return { code: 0 };
        },
      },
    },
  };
  const intake = buildIntakeRecord("https://www.xiaohongshu.com/explore/abc?xsec_token=secret");
  assert.equal(intake.video.platform, "xiaohongshu");
  assert.equal(validateRecord(intake).valid, true);

  const event = gatewayEvent("@_user_1 https://www.xiaohongshu.com/explore/abc?xsec_token=secret", {
    mentions: [{ key: "@_user_1", name: "Miffy" }],
  });
  assert.equal(await handleGatewayMessage(event, { client, config: { baseId: "base_1", tableId: "table_1", botName: "Miffy" } }), true);
  assert.equal(created.length, 1);
  assert.equal(created[0].data.fields["视频链接"].link, "https://www.xiaohongshu.com/explore/abc?xsec_token=secret");
  assert.equal(created[0].data.fields["采集状态"], "受限待补充");
  const reply = JSON.parse(messages[0].data.content).text;
  assert.match(reply, /已建立「受限待补充」任务/);
  assert.match(reply, /record=rec_new/);
  assert.match(reply, /Muse \/ Codex \/ Claude/);
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
