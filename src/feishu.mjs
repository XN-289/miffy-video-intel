import * as lark from "@larksuiteoapi/node-sdk";
import fs from "node:fs";
import path from "node:path";
import { actionButton, buildInteractiveCard, cardToPlainText, markdownLink } from "./feishu-cards.mjs";

const text = (value) => String(value || "");
const EVIDENCE_IMAGE_LIMIT = 7;
const EVIDENCE_IMAGE_MAX_BYTES = 500 * 1024;
const EVIDENCE_IMAGE_MAX_WIDTH = 720;

function joinList(values) {
  return (values || []).map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function detectPlatformLabel(platform, url = "") {
  const platformMap = {
    xiaohongshu: "小红书",
    douyin: "抖音",
    channels: "视频号",
    other: "其他",
  };
  return platformMap[detectPlatformKey(platform, url)] || "其他";
}

export function detectPlatformKey(platform, url = "") {
  const value = `${platform || ""} ${url}`.toLowerCase();
  if (value.includes("xiaohongshu") || value.includes("xhslink")) return "xiaohongshu";
  if (value.includes("douyin")) return "douyin";
  if (value.includes("channels.weixin.qq.com")) return "channels";
  return "other";
}

export function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  for (const key of [...url.searchParams.keys()]) {
    if (/^xsec_/i.test(key) || /^utm_/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function fieldDefinitions() {
  return [
    { field_name: "视频链接", type: 15, ui_type: "Url" },
    {
      field_name: "平台",
      type: 3,
      ui_type: "SingleSelect",
      property: { options: [{ name: "小红书" }, { name: "抖音" }, { name: "视频号" }, { name: "其他" }] },
    },
    { field_name: "标题", type: 1 },
    { field_name: "作者", type: 1 },
    { field_name: "简介", type: 1 },
    { field_name: "互动数据", type: 1 },
    { field_name: "商品信息", type: 1 },
    { field_name: "评论区洞察", type: 1 },
    { field_name: "内容证据", type: 1 },
    { field_name: "证据摘录", type: 1 },
    { field_name: "开头钩子", type: 1 },
    { field_name: "内容结构", type: 1 },
    { field_name: "为什么能火", type: 1 },
    { field_name: "钩子强度", type: 2, ui_type: "Number" },
    { field_name: "场景匹配", type: 2, ui_type: "Number" },
    { field_name: "转化强度", type: 2, ui_type: "Number" },
    { field_name: "可复制性", type: 2, ui_type: "Number" },
    { field_name: "综合潜力", type: 2, ui_type: "Number" },
    { field_name: "商品与场景匹配", type: 1 },
    { field_name: "目标人群", type: 1 },
    { field_name: "转化路径", type: 1 },
    { field_name: "可复用打法", type: 1 },
    { field_name: "店铺对标动作", type: 1 },
    { field_name: "建议拍摄脚本", type: 1 },
    { field_name: "风险与待验证", type: 1 },
    { field_name: "首图链接", type: 15, ui_type: "Url" },
    { field_name: "关键帧证据", type: 17, ui_type: "Attachment" },
    {
      field_name: "采集状态",
      type: 3,
      ui_type: "SingleSelect",
      property: { options: [{ name: "Agent可见" }, { name: "部分材料" }, { name: "受限待补充" }] },
    },
    {
      field_name: "分析置信度",
      type: 3,
      ui_type: "SingleSelect",
      property: { options: [{ name: "高" }, { name: "中" }, { name: "低" }] },
    },
    { field_name: "采集Agent", type: 1 },
    { field_name: "模型", type: 1 },
    { field_name: "完整JSON摘要", type: 1 },
    { field_name: "添加时间", type: 5, ui_type: "DateTime", property: { date_formatter: "yyyy/MM/dd HH:mm" } },
    { field_name: "更新时间", type: 5, ui_type: "DateTime", property: { date_formatter: "yyyy/MM/dd HH:mm" } },
  ];
}

function assertOk(result, action) {
  if (result?.code !== 0) throw new Error(`${action} failed: ${result?.code || "unknown"} ${result?.msg || ""}`.trim());
  return result;
}

export function createClient(config) {
  return new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });
}

export async function ensureFields(client, config) {
  let pageToken;
  const existing = new Set();
  do {
    const response = assertOk(
      await client.bitable.appTableField.list({
        params: { page_size: 100, page_token: pageToken },
        path: { app_token: config.baseId, table_id: config.tableId },
      }),
      "List Bitable fields"
    );
    for (const field of response.data?.items || []) existing.add(field.field_name);
    pageToken = response.data?.has_more ? response.data?.page_token : "";
  } while (pageToken);

  const created = [];
  for (const field of fieldDefinitions()) {
    if (existing.has(field.field_name)) continue;
    assertOk(
      await client.bitable.appTableField.create({
        data: field,
        path: { app_token: config.baseId, table_id: config.tableId },
      }),
      `Create field ${field.field_name}`
    );
    created.push(field.field_name);
  }
  return { existing: [...existing], created };
}

export function bitableUrl(config, recordId = "") {
  const fallback = new URL(`https://www.feishu.cn/base/${config.baseId}`);
  const target = config.baseUrl && /^https?:\/\//.test(config.baseUrl) ? new URL(config.baseUrl) : fallback;
  if (config.tableId) target.searchParams.set("table", config.tableId);
  if (recordId) target.searchParams.set("record", recordId);
  return target.toString();
}

export function resolveRecordUrl(config, recordId, preferredUrl = "") {
  if (preferredUrl && /^https?:\/\//.test(preferredUrl) && preferredUrl !== config.baseId) return preferredUrl;
  return bitableUrl(config, recordId);
}

export async function searchRecordSummaries(client, config) {
  let pageToken;
  const items = [];
  do {
    const response = assertOk(
      await client.bitable.appTableRecord.search({
        // Old tables may not have every v0.5 summary field yet. Request the
        // full record shape so navigation commands work before ensureFields.
        data: {},
        params: { page_size: 500, page_token: pageToken },
        path: { app_token: config.baseId, table_id: config.tableId },
      }),
      "Search Bitable records"
    );
    items.push(...(response.data?.items || []));
    pageToken = response.data?.has_more ? response.data?.page_token : "";
  } while (pageToken);
  return items;
}

export async function findRecord(client, config, rawUrl) {
  const target = normalizeUrl(rawUrl);
  const items = await searchRecordSummaries(client, config);
  return items.find((item) => {
    const link = item.fields?.["视频链接"];
    const value = typeof link === "object" ? link?.link : link;
    return value && normalizeUrl(value) === target;
  });
}

export async function findRecordId(client, config, rawUrl) {
  return (await findRecord(client, config, rawUrl))?.record_id || "";
}

export function recordToFields(record, config = {}) {
  const video = record.video || {};
  const collection = record.collection || {};
  const analysis = record.analysis || {};
  const action = record.shop_action || {};
  const blocked = collection.access === "blocked";
  const product = video.product || {};
  const productText = [
    product.name ? `商品：${product.name}` : "",
    product.price_range ? `价格：${product.price_range}` : "",
    product.selling_points?.length ? `卖点：${product.selling_points.join(" / ")}` : "",
    product.purchase_path ? `转化入口：${product.purchase_path}` : "",
  ].filter(Boolean).join("\n");
  const evidenceText = (collection.evidence || []).map((item) => `[${item.source}/${item.confidence}] ${item.quote}`).join("\n");
  const contentText = [
    video.content?.transcript ? `口播：${video.content.transcript}` : "",
    video.content?.visual_notes?.length ? `画面：${joinList(video.content.visual_notes)}` : "",
  ].filter(Boolean).join("\n");
  const scriptText = blocked
    ? ""
    : [
        `时长：${action.shooting_script?.duration_seconds || "-"} 秒`,
        `钩子：${action.shooting_script?.hook || "-"}`,
        action.shooting_script?.scenes?.length ? `分镜：\n${joinList(action.shooting_script.scenes)}` : "",
        `行动指令：${action.shooting_script?.cta || "-"}`,
      ].filter(Boolean).join("\n");
  const now = Date.now();
  const confidenceMap = { high: "高", medium: "中", low: "低" };
  const statusMap = { visible: "Agent可见", partial: "部分材料", blocked: "受限待补充" };

  return {
    视频链接: { text: video.title || video.url, link: video.url },
    平台: detectPlatformLabel(video.platform, video.url),
    标题: text(video.title),
    作者: text(video.author),
    简介: text(video.description),
    互动数据: text(video.metrics_text),
    商品信息: productText,
    评论区洞察: text(analysis.comment_insight),
    内容证据: contentText,
    证据摘录: evidenceText,
    开头钩子: text(analysis.hook),
    内容结构: joinList(analysis.content_structure),
    为什么能火: joinList(analysis.why_viral),
    钩子强度: analysis.scores?.hook_strength,
    场景匹配: analysis.scores?.product_scene_fit,
    转化强度: analysis.scores?.conversion_strength,
    可复制性: analysis.scores?.replicability,
    综合潜力: analysis.scores?.overall,
    商品与场景匹配: text(analysis.product_scene_fit),
    目标人群: text(analysis.audience),
    转化路径: joinList(analysis.conversion_path),
    可复用打法: joinList(analysis.reusable_patterns),
    店铺对标动作: joinList(action.benchmark_actions),
    建议拍摄脚本: scriptText,
    风险与待验证: joinList(action.risks?.length ? action.risks : collection.missing),
    首图链接: video.cover_url ? { text: "首图", link: video.cover_url } : null,
    采集状态: statusMap[collection.access] || "受限待补充",
    分析置信度: confidenceMap[action.confidence] || "低",
    采集Agent: text(collection.collector_agent || config.defaultAgent),
    模型: text(collection.model || config.defaultModel),
    完整JSON摘要: JSON.stringify(record),
    添加时间: now,
    更新时间: now,
  };
}

function stripEmpty(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const startOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (startOfFrame) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (marker === 0xda || offset + 3 >= buffer.length) return null;

    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function evidenceImageFailure(item, reason) {
  return {
    path: item?.path || "",
    timestamp_seconds: item?.timestamp_seconds,
    label: item?.label || "",
    reason,
  };
}

export function inspectEvidenceImages(record, assetBasePath = process.cwd()) {
  const items = record?.video?.evidence_images || [];
  const basePath = path.resolve(assetBasePath);
  const planned = [];
  const failed = [];

  if (items.length > EVIDENCE_IMAGE_LIMIT) {
    failed.push({
      path: "",
      timestamp_seconds: undefined,
      label: "",
      reason: `select at most ${EVIDENCE_IMAGE_LIMIT} key frames, received ${items.length}`,
    });
    return { planned, failed };
  }

  for (const item of items) {
    const rawPath = item.path || "";
    const normalizedPath = rawPath.replace(/\\/g, "/");
    if (!normalizedPath.startsWith("analyses/assets/")) {
      failed.push(evidenceImageFailure(item, "path must start with analyses/assets/"));
      continue;
    }
    if (path.isAbsolute(rawPath) || /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.split(/[\\/]+/).includes("..")) {
      failed.push(evidenceImageFailure(item, "path must be repository-relative and cannot traverse outside it"));
      continue;
    }

    const fullPath = path.resolve(basePath, rawPath);
    if (fullPath !== basePath && !fullPath.startsWith(`${basePath}${path.sep}`)) {
      failed.push(evidenceImageFailure(item, "path must stay inside the repository"));
      continue;
    }
    if (path.extname(rawPath).toLowerCase() !== ".jpg") {
      failed.push(evidenceImageFailure(item, "only .jpg files are accepted"));
      continue;
    }
    const timestamp = Number(item.timestamp_seconds);
    if (!Number.isFinite(timestamp) || !path.basename(normalizedPath).includes(`-${timestamp}s-`)) {
      failed.push(evidenceImageFailure(item, "file name must contain -<timestamp-seconds>s- before the label"));
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      failed.push(evidenceImageFailure(item, "file not found"));
      continue;
    }
    if (!stat.isFile()) {
      failed.push(evidenceImageFailure(item, "path is not a file"));
      continue;
    }
    if (stat.size > EVIDENCE_IMAGE_MAX_BYTES) {
      failed.push(evidenceImageFailure(item, `file is ${stat.size} bytes; compress it to ${EVIDENCE_IMAGE_MAX_BYTES} bytes or less`));
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(fullPath);
    } catch (error) {
      failed.push(evidenceImageFailure(item, `cannot read file header: ${error?.message || error}`));
      continue;
    }
    const dimensions = jpegDimensions(buffer);
    if (!dimensions) {
      failed.push(evidenceImageFailure(item, "cannot read JPEG dimensions; regenerate the frame with ffmpeg"));
      continue;
    }
    if (dimensions.width > EVIDENCE_IMAGE_MAX_WIDTH) {
      failed.push(evidenceImageFailure(item, `width is ${dimensions.width}px; compress it to ${EVIDENCE_IMAGE_MAX_WIDTH}px or less`));
      continue;
    }

    planned.push({
      path: rawPath,
      file_name: path.basename(fullPath),
      absolute_path: fullPath,
      timestamp_seconds: item.timestamp_seconds,
      label: item.label,
      size_bytes: stat.size,
      width: dimensions.width,
      height: dimensions.height,
    });
  }

  return { planned, failed };
}

function attachmentFailureReason(error) {
  const details = [error?.msg, error?.response?.data?.msg, error?.response?.data?.error?.message, error?.message]
    .filter(Boolean)
    .map((value) => String(value))
    .join(" ");
  const normalized = details.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("403") || normalized.includes("access denied") || normalized.includes("权限")) {
    return "上传失败：请给飞书应用开通「上传、下载云文档素材」权限，发布新版本后重试";
  }
  return `upload failed: ${details || "unknown error"}`;
}

async function uploadEvidenceImages(client, config, planned) {
  const uploaded = [];
  const failed = [];

  for (const image of planned) {
    try {
      const file = fs.readFileSync(image.absolute_path);
      const response = await client.drive.media.uploadAll({
        data: {
          file_name: image.file_name,
          // Bitable attachment fields consume file media even when the asset is a JPG.
          parent_type: "bitable_file",
          parent_node: config.baseId,
          size: file.length,
          file,
        },
      });
      if (response?.code && response.code !== 0) throw new Error(response.msg || `Feishu error ${response.code}`);
      const fileToken = response?.file_token;
      if (!fileToken) throw new Error("Feishu did not return a file token");
      uploaded.push({ path: image.path, file_token: fileToken });
    } catch (error) {
      failed.push({
        path: image.path,
        timestamp_seconds: image.timestamp_seconds,
        label: image.label,
        reason: attachmentFailureReason(error),
      });
    }
  }

  return { uploaded, failed };
}

export async function upsertRecord(client, config, record, { dryRun = false, assetBasePath = process.cwd() } = {}) {
  const fields = stripEmpty(recordToFields(record, config));
  const evidence = record?.video?.evidence_images || [];
  const evidencePlan = inspectEvidenceImages(record, assetBasePath);

  if (dryRun) {
    return {
      action: "dry-run",
      field_names: Object.keys(fields),
      fields,
      attachments: {
        will_upload: evidencePlan.planned,
        failed: evidencePlan.failed,
      },
    };
  }

  await ensureFields(client, config);
  const recordId = await findRecordId(client, config, record.video.url);
  const attachments = await uploadEvidenceImages(client, config, evidencePlan.planned);
  if (evidence.length) {
    fields["关键帧证据"] = attachments.uploaded.map((item) => ({ file_token: item.file_token }));
  }

  if (recordId) {
    const updated = assertOk(
      await client.bitable.appTableRecord.update({
        data: { fields },
        path: { app_token: config.baseId, table_id: config.tableId, record_id: recordId },
      }),
      "Update Bitable record"
    );
    return {
      action: "updated",
      record_id: recordId,
      record_url: resolveRecordUrl(config, recordId, updated.data?.record?.record_url),
      attachments,
    };
  }

  const created = assertOk(
    await client.bitable.appTableRecord.create({
      data: { fields },
      path: { app_token: config.baseId, table_id: config.tableId },
    }),
    "Create Bitable record"
  );
  return {
    action: "created",
    record_id: created.data?.record?.record_id,
    record_url: resolveRecordUrl(config, created.data?.record?.record_id, created.data?.record?.record_url),
    attachments,
  };
}

export async function notifyGroup(client, chatId, record, result) {
  if (!chatId) return false;
  const status = record.collection?.access === "blocked" ? "受限待补充" : "分析完成";
  const action = result.action === "created" ? "已新建" : result.action === "updated" ? "已更新" : "预检完成";
  const failedAttachments = result.attachments?.failed || [];
  const title = record.video?.title || record.video?.url || "未命名记录";
  const card = buildInteractiveCard({
    title: `Miffy · ${action} · ${status}`,
    template: status === "受限待补充" ? "orange" : "green",
    sections: [
      `**${title}**`,
      [
        record.video?.url ? markdownLink("看原视频", record.video.url) : "",
        result.record_url ? markdownLink("打开记录", result.record_url) : "",
      ].filter(Boolean).join("  ·  "),
      result.attachments ? `关键帧：成功 ${result.attachments.uploaded?.length || 0} 张 / 失败 ${failedAttachments.length} 张` : "",
      failedAttachments.length ? `**附件问题**：${failedAttachments[0].reason}` : "",
    ],
    actions: [
      ...(result.record_url ? [actionButton("打开记录", result.record_url, "primary")] : []),
      ...(record.video?.url ? [actionButton("看原视频", record.video.url)] : []),
    ],
    note: "外部 Agent 产物会按同一个视频链接更新这条记录。",
  });
  try {
    assertOk(
      await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) },
      }),
      "Send Feishu group card"
    );
  } catch {
    assertOk(
      await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text: cardToPlainText(card) }) },
      }),
      "Send Feishu group notification"
    );
  }
  return true;
}

export async function initWorkbench(client, config) {
  const created = assertOk(
    await client.bitable.app.create({ data: { name: "Miffy 视频对标工作台" } }),
    "Create Bitable"
  );
  const app = created.data?.app || {};
  const table = assertOk(
    await client.bitable.appTable.create({
      data: {
        table: {
          name: "对标视频库",
          default_view_name: "全部视频",
          fields: fieldDefinitions(),
        },
      },
      path: { app_token: app.app_token },
    }),
    "Create Bitable table"
  );
  const tableId = table.data?.table_id;
  await client.bitable.appTableView.create({
    data: { view_name: "执行看板", view_type: "kanban" },
    path: { app_token: app.app_token, table_id: tableId },
  });
  await client.bitable.appTableView.create({
    data: { view_name: "视频画册", view_type: "gallery" },
    path: { app_token: app.app_token, table_id: tableId },
  });
  if (config.chatId) {
    await client.drive.permissionMember.create({
      data: { member_type: "openchat", member_id: config.chatId, perm: "edit", type: "chat" },
      params: { type: "bitable", need_notification: false },
      path: { token: app.app_token },
    }).catch(() => undefined);
  }
  return { app_token: app.app_token, app_url: app.url, table_id: tableId };
}
