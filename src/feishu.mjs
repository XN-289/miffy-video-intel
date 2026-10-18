import * as lark from "@larksuiteoapi/node-sdk";

const text = (value) => String(value || "");

function joinList(values) {
  return (values || []).map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function detectPlatformLabel(platform, url = "") {
  const value = `${platform || ""} ${url}`.toLowerCase();
  if (value.includes("xiaohongshu") || value.includes("xhslink")) return "小红书";
  if (value.includes("douyin")) return "抖音";
  if (value.includes("channels.weixin.qq.com")) return "视频号";
  return "其他";
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

export async function findRecordId(client, config, rawUrl) {
  const target = normalizeUrl(rawUrl);
  let pageToken;
  do {
    const response = assertOk(
      await client.bitable.appTableRecord.search({
        data: { field_names: ["视频链接"] },
        params: { page_size: 500, page_token: pageToken },
        path: { app_token: config.baseId, table_id: config.tableId },
      }),
      "Search Bitable records"
    );
    for (const item of response.data?.items || []) {
      const link = item.fields?.["视频链接"];
      const value = typeof link === "object" ? link?.link : link;
      if (value && normalizeUrl(value) === target) return item.record_id;
    }
    pageToken = response.data?.has_more ? response.data?.page_token : "";
  } while (pageToken);
  return "";
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

export async function upsertRecord(client, config, record, { dryRun = false } = {}) {
  const fields = stripEmpty(recordToFields(record, config));
  if (dryRun) {
    return { action: "dry-run", field_names: Object.keys(fields), fields };
  }

  await ensureFields(client, config);
  const recordId = await findRecordId(client, config, record.video.url);
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
      record_url: updated.data?.record?.record_url || config.baseId,
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
    record_url: created.data?.record?.record_url || config.baseId,
  };
}

export async function notifyGroup(client, chatId, record, result) {
  if (!chatId) return false;
  const status = record.collection?.access === "blocked" ? "受限待补充" : "分析完成";
  const content = [
    `Miffy 视频对标：${status}`,
    record.video?.title || record.video?.url,
    result.record_url ? `记录：${result.record_url}` : "",
  ].filter(Boolean).join("\n");
  assertOk(
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text: content }) },
    }),
    "Send Feishu group notification"
  );
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
