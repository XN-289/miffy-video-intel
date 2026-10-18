import * as lark from "@larksuiteoapi/node-sdk";
import {
  bitableUrl,
  createClient,
  detectPlatformKey,
  findRecord,
  resolveRecordUrl,
  searchRecordSummaries,
  upsertRecord,
} from "./feishu.mjs";
import { validateRecord } from "./validator.mjs";

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function collectPostText(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectPostText(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  if (typeof value.text === "string") result.push(value.text);
  if (typeof value.href === "string") result.push(value.href);
  for (const item of Object.values(value)) {
    if (item !== value.text && item !== value.href) collectPostText(item, result);
  }
  return result;
}

function cleanUrl(value) {
  return value.replace(/[），。；;,]+$/g, "");
}

function firstUrl(value) {
  return (String(value || "").match(URL_PATTERN) || []).map(cleanUrl)[0] || "";
}

export function parseGatewayEvent(event, botName = "Miffy") {
  const message = event?.message;
  if (!message || event?.sender?.sender_type !== "user") return null;
  if (!["text", "post"].includes(message.message_type)) return null;

  let content;
  try {
    content = JSON.parse(message.content);
  } catch {
    return null;
  }

  let text = message.message_type === "text" ? content.text || "" : collectPostText(content).join(" ");
  for (const mention of message.mentions || []) {
    if (mention?.key) text = text.split(mention.key).join(" ");
  }
  text = text.replace(/\u200b/g, "").trim();

  const mentioned = (message.mentions || []).some((mention) => normalizeName(mention?.name).includes(normalizeName(botName)));
  if (message.chat_type !== "p2p" && !mentioned) return null;
  if (!text) return null;

  return { text, chatId: message.chat_id, messageId: message.message_id };
}

function fieldText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return String(value.text || value.link || "");
  return String(value);
}

function recordUpdatedTime(item) {
  const value = item.fields?.["更新时间"];
  const numeric = Number(typeof value === "object" ? value?.value : value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

function formatRecord(item, config) {
  const link = item.fields?.["视频链接"];
  const title = fieldText(item.fields?.["标题"]) || fieldText(link) || "未命名记录";
  const status = fieldText(item.fields?.["采集状态"]) || "未知状态";
  const confidence = fieldText(item.fields?.["分析置信度"]);
  const score = fieldText(item.fields?.["综合潜力"]);
  const agent = fieldText(item.fields?.["采集Agent"]);
  const updated = recordUpdatedTime(item);
  return [
    `${title}（${status}${confidence ? ` / 置信${confidence}` : ""}${score ? ` / 综合${score}` : ""}）`,
    `记录：${resolveRecordUrl(config, item.record_id)}`,
    fieldText(link) ? `视频：${fieldText(link)}` : "",
    agent ? `Agent：${agent}` : "",
    updated ? `更新：${new Date(updated).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}` : "",
  ].filter(Boolean).join("\n");
}

function helpText() {
  return [
    "Miffy 是视频对标工作的入口和看板，不负责绕过平台限制或编造分析。",
    "",
    "可用命令：",
    "1. @Miffy 帮助：查看本说明",
    "2. @Miffy 看板：打开共享多维表格",
    "3. @Miffy 最新：查看最近 5 条记录",
    "4. @Miffy 待补充：查看受限待补充队列",
    "5. @Miffy 查 <视频链接>：按规范化链接查重",
    "6. @Miffy 分析 <视频链接>：生成给 Muse / Codex / Claude 的标准任务提示词",
    "7. @Miffy <视频链接>：新链接先建「受限待补充」任务；外部 Agent 分析后会更新同一条记录",
    "",
    "外部 Agent 产物必须先 validate，再 dry-run；真实写入需要明确授权。",
  ].join("\n");
}

function analysisPrompt(url) {
  return [
    "请使用 miffy-video-intel 分析这条电商带货视频：",
    url,
    "",
    "要求：",
    "1. 先读取 skills/miffy-video-intel/SKILL.md 和 references/analysis-framework.md。",
    "2. 用你的允许浏览器能力打开页面并查看完整视频；不能只看封面、简介或逐字稿。",
    "3. 采集标题、作者、互动、商品、评论、口播、带时间戳画面证据和转化路径。",
    "4. 如果访问受限，生成 blocked JSON，向用户索要截图、录屏、口播稿、商品和评论；不要绕过风控，不要编造。",
    "5. 按 v0.4 框架输出 analyses/<platform>-<video-id>.json，并运行 validate。",
    "6. 先运行 upsert --dry-run；只有用户明确授权后才真实写入飞书。",
    "7. 返回记录链接、三个最值得对标的具体动作和一条可拍脚本。",
  ].join("\n");
}

export function buildIntakeRecord(url, config = {}) {
  const record = {
    schema_version: 1,
    video: {
      url,
      platform: detectPlatformKey("", url),
      title: "",
      author: "",
    },
    collection: {
      access: "blocked",
      method: "unknown",
      collector_agent: "Miffy入口",
      model: "",
      collected_at: new Date().toISOString(),
      evidence: [],
      missing: [
        "外部Agent页面与视频证据",
        "标题、作者和互动数据",
        "商品、价格与转化入口",
        "高赞评论和主要异议",
        "口播稿和带时间戳画面证据",
      ],
    },
    next_action: "ask_user_for_materials",
  };
  const validation = validateRecord(record);
  if (!validation.valid) throw new Error(`Invalid gateway intake record: ${validation.errors.join("; ")}`);
  return record;
}

async function sendText(client, chatId, replyText) {
  await client.im.message.create({
    params: { receive_id_type: "chat_id" },
    data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text: replyText }) },
  });
}

export async function handleGatewayMessage(event, { client, config }) {
  const incoming = parseGatewayEvent(event, config.botName);
  if (!incoming) return false;

  const parts = incoming.text.split(/\s+/);
  const command = normalizeName(parts[0]);
  const argument = parts.slice(1).join(" ");
  let reply = "";

  try {
    if (["帮助", "help", "指令", "commands"].includes(command)) {
      reply = helpText();
    } else if (["看板", "工作台", "dashboard", "base"].includes(command)) {
      reply = `Miffy 对标工作台：\n${bitableUrl(config)}`;
    } else if (["最新", "latest"].includes(command)) {
      const items = (await searchRecordSummaries(client, config))
        .sort((a, b) => recordUpdatedTime(b) - recordUpdatedTime(a))
        .slice(0, 5);
      reply = items.length ? `最近 ${items.length} 条：\n\n${items.map((item) => formatRecord(item, config)).join("\n\n")}` : "表格还没有记录。发 @Miffy <视频链接> 会先创建待处理任务。";
    } else if (["待补充", "blocked"].includes(command)) {
      const items = (await searchRecordSummaries(client, config))
        .filter((item) => fieldText(item.fields?.["采集状态"]) === "受限待补充")
        .sort((a, b) => recordUpdatedTime(b) - recordUpdatedTime(a))
        .slice(0, 10);
      reply = items.length ? `待补充 ${items.length} 条（最多显示 10 条）：\n\n${items.map((item) => formatRecord(item, config)).join("\n\n")}` : "没有受限待补充记录。";
    } else if (["状态", "status"].includes(command)) {
      const items = await searchRecordSummaries(client, config);
      const blocked = items.filter((item) => fieldText(item.fields?.["采集状态"]) === "受限待补充").length;
      reply = `当前共 ${items.length} 条对标记录，其中 ${blocked} 条待补充。\n看板：${bitableUrl(config)}`;
    } else if (["查", "find", "查询"].includes(command)) {
      const url = firstUrl(argument);
      if (!url) throw new Error("请在“查”后面提供 http/https 视频链接。");
      const item = await findRecord(client, config, url);
      reply = item ? `已找到同链接记录：\n\n${formatRecord(item, config)}` : `没有找到这条链接。发 @Miffy ${url} 可以先建待处理任务。`;
    } else if (["分析", "agent", "任务"].includes(command)) {
      const url = firstUrl(argument);
      if (!url) throw new Error("请在“分析”后面提供 http/https 视频链接。");
      reply = analysisPrompt(url);
    } else if (firstUrl(incoming.text)) {
      const url = firstUrl(incoming.text);
      const existing = await findRecord(client, config, url);
      if (existing) {
        reply = `这条链接已在工作台，不重复新建：\n\n${formatRecord(existing, config)}`;
      } else {
        const result = await upsertRecord(client, config, buildIntakeRecord(url, config));
        reply = [
          "已建立「受限待补充」任务。Miffy 不会猜测视频内容。",
          `记录：${result.record_url}`,
          `视频：${url}`,
          "",
          "下一步：把“分析”提示词发给 Muse / Codex / Claude；Agent 分析后会按同一个规范化链接更新这条记录。",
        ].join("\n");
      }
    } else {
      reply = `我不理解这条指令。\n\n${helpText()}`;
    }
  } catch (error) {
    reply = `Miffy 处理失败：${error?.message || error}\n\n可以先回复“帮助”查看可用命令。`;
  }

  await sendText(client, incoming.chatId, reply);
  return true;
}

export async function startGateway(config) {
  const client = createClient(config);
  const wsClient = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.info,
  });

  await wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (event) => {
        try {
          await handleGatewayMessage(event, { client, config });
        } catch (error) {
          console.error("Gateway message failed:", error?.message || error);
        }
      },
    }),
  });
  return wsClient;
}
