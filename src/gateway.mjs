import * as lark from "@larksuiteoapi/node-sdk";
import { actionButton, buildInteractiveCard, cardToPlainText, markdownLink } from "./feishu-cards.mjs";
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

function fieldUrl(value) {
  if (value === null || value === undefined) return "";
  const url = typeof value === "object" ? String(value.link || "") : String(value);
  return /^https?:\/\//.test(url) ? url : "";
}

function recordUpdatedTime(item) {
  const value = item.fields?.["更新时间"];
  const numeric = Number(typeof value === "object" ? value?.value : value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

function formatRecord(item, config) {
  const link = item.fields?.["视频链接"];
  const videoUrl = fieldUrl(link);
  const title = fieldText(item.fields?.["标题"]) || fieldText(link) || "未命名记录";
  const status = fieldText(item.fields?.["采集状态"]) || "未知状态";
  const confidence = fieldText(item.fields?.["分析置信度"]);
  const score = fieldText(item.fields?.["综合潜力"]);
  const agent = fieldText(item.fields?.["采集Agent"]);
  const updated = recordUpdatedTime(item);
  return [
    `**${title}**`,
    [
      status,
      confidence ? `置信 ${confidence}` : "",
      score ? `综合 ${score}` : "",
      agent ? `Agent ${agent}` : "",
    ].filter(Boolean).join(" · "),
    [
      markdownLink("打开记录", resolveRecordUrl(config, item.record_id)),
      videoUrl ? markdownLink("看原视频", videoUrl) : "",
    ].filter(Boolean).join("  ·  "),
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

function helpCard() {
  return buildInteractiveCard({
    title: "Miffy · 使用入口",
    sections: [
      "**最常用**\n直接 @Miffy 并发送视频链接：新链接会先进入「受限待补充」队列，不会生成猜测分析。",
      "**查看工作台**\n看板：打开多维表格\n最新：最近 5 条记录\n待补充：当前证据不足的队列\n状态：总量和待补数量",
      "**查重与外部分析**\n查 <视频链接>：按规范化链接查重\n分析 <视频链接>：生成给 Muse / Codex / Claude 的任务提示词",
    ],
    note: "Miffy 不绕过平台风控；完整视频理解交给外部 Agent，结果回到同一条记录。",
  });
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

function recordsCard({ title, items, emptyText, config, template = "blue" }) {
  return buildInteractiveCard({
    title,
    template,
    sections: items.length ? items.map((item) => formatRecord(item, config)) : [emptyText],
    actions: items.length ? [actionButton("打开工作台", bitableUrl(config), "primary")] : [],
    note: items.length ? "点击记录里的链接可以直接进入对应视频或表格记录。" : "新链接会先进入待补充队列。",
  });
}

function singleRecordCard({ title, item, config, note, template = "blue" }) {
  const videoUrl = fieldUrl(item.fields?.["视频链接"]);
  return buildInteractiveCard({
    title,
    template,
    sections: [formatRecord(item, config)],
    actions: [
      actionButton("打开记录", resolveRecordUrl(config, item.record_id), "primary"),
      actionButton("看原视频", videoUrl),
    ].filter((action) => action.url),
    note,
  });
}

function friendlyError(error) {
  const value = String(error?.message || error || "");
  const normalized = value.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("权限")) {
    return "飞书权限不足：请检查应用的多维表格和消息权限，发布新版本后重试。";
  }
  if (normalized.includes("app_token") || normalized.includes("table_id") || normalized.includes("not exist")) {
    return "找不到指定多维表格：请检查 Base ID、Table ID，并确认已把应用添加到这个表格。";
  }
  if (normalized.includes("app_id") || normalized.includes("app_secret") || normalized.includes("token")) {
    return "应用凭证无效：请检查本机 .env 里的 FEISHU_APP_ID 和 FEISHU_APP_SECRET。";
  }
  return value || "未知错误";
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

async function sendReply(client, chatId, reply) {
  if (reply?.card) {
    try {
      await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "interactive", content: JSON.stringify(reply.card) },
      });
    } catch {
      await sendText(client, chatId, cardToPlainText(reply.card));
    }
    return;
  }
  await sendText(client, chatId, reply.text || "");
}

export async function handleGatewayMessage(event, { client, config }) {
  const incoming = parseGatewayEvent(event, config.botName);
  if (!incoming) return false;

  const parts = incoming.text.split(/\s+/);
  const command = normalizeName(parts[0]);
  const argument = parts.slice(1).join(" ");
  let reply;

  try {
    if (["帮助", "help", "指令", "commands"].includes(command)) {
      reply = { card: helpCard() };
    } else if (["看板", "工作台", "dashboard", "base"].includes(command)) {
      reply = {
        card: buildInteractiveCard({
          title: "Miffy · 对标工作台",
          sections: ["所有视频记录、待补队列和分析结论都沉淀在同一个多维表格。"],
          actions: [actionButton("打开工作台", bitableUrl(config), "primary")],
          note: "群里可以直接丢视频链接，外部 Agent 分析后会更新同一条记录。",
        }),
      };
    } else if (["最新", "latest"].includes(command)) {
      const items = (await searchRecordSummaries(client, config))
        .sort((a, b) => recordUpdatedTime(b) - recordUpdatedTime(a))
        .slice(0, 5);
      reply = {
        card: recordsCard({
          title: `Miffy · 最新 ${items.length} 条`,
          items,
          emptyText: "表格还没有记录。发送 @Miffy <视频链接> 会先创建待处理任务。",
          config,
        }),
      };
    } else if (["待补充", "blocked"].includes(command)) {
      const items = (await searchRecordSummaries(client, config))
        .filter((item) => fieldText(item.fields?.["采集状态"]) === "受限待补充")
        .sort((a, b) => recordUpdatedTime(b) - recordUpdatedTime(a))
        .slice(0, 10);
      reply = {
        card: recordsCard({
          title: `Miffy · 待补充 ${items.length} 条`,
          items,
          emptyText: "当前没有受限待补充记录。",
          config,
          template: items.length ? "orange" : "green",
        }),
      };
    } else if (["状态", "status"].includes(command)) {
      const items = await searchRecordSummaries(client, config);
      const blocked = items.filter((item) => fieldText(item.fields?.["采集状态"]) === "受限待补充").length;
      reply = {
        card: buildInteractiveCard({
          title: "Miffy · 工作台状态",
          template: blocked ? "orange" : "green",
          sections: [
            `**总量**：${items.length} 条对标记录`,
            `**待补充**：${blocked} 条`,
            blocked ? "有待补记录时，优先把「分析」提示词交给外部 Agent 处理。" : "当前队列没有积压。",
          ],
          actions: [actionButton("打开工作台", bitableUrl(config), "primary")],
        }),
      };
    } else if (["查", "find", "查询"].includes(command)) {
      const url = firstUrl(argument);
      if (!url) throw new Error("请在“查”后面提供 http/https 视频链接。");
      const item = await findRecord(client, config, url);
      reply = item
        ? { card: singleRecordCard({ title: "Miffy · 已找到同链接记录", item, config, note: "同一条链接不会重复建记录。" }) }
        : {
            card: buildInteractiveCard({
              title: "Miffy · 未找到这条链接",
              sections: [`这条链接还没有入库。发送：\n@Miffy ${url}`],
              note: "新链接会先创建受限待补充任务。",
            }),
          };
    } else if (["分析", "agent", "任务"].includes(command)) {
      const url = firstUrl(argument);
      if (!url) throw new Error("请在“分析”后面提供 http/https 视频链接。");
      reply = { text: analysisPrompt(url) };
    } else if (firstUrl(incoming.text)) {
      const url = firstUrl(incoming.text);
      const existing = await findRecord(client, config, url);
      if (existing) {
        reply = { card: singleRecordCard({ title: "Miffy · 链接已存在", item: existing, config, note: "没有重复新建；外部 Agent 分析后会更新这条记录。" }) };
      } else {
        const result = await upsertRecord(client, config, buildIntakeRecord(url, config));
        reply = {
          card: buildInteractiveCard({
            title: "Miffy · 已加入待补充队列",
            template: "orange",
            sections: [
              "这条链接已登记。Miffy 只做入口和看板，不会猜测视频内容。",
              [
                markdownLink("打开记录", result.record_url),
                markdownLink("看原视频", url),
              ].join("  ·  "),
              "**下一步**\n1. 复制任务指令：`@Miffy 分析 " + url + "`\n2. 发给 Muse / Codex / Claude\n3. Agent 先 validate，再 dry-run\n4. 用户确认后真实写入，同链接记录自动更新",
            ],
            actions: [
              actionButton("打开记录", result.record_url, "primary"),
              actionButton("看原视频", url),
            ].filter((action) => action.url),
            note: "不要把 App Secret 或 .env 内容发给任何 Agent。",
          }),
        };
      }
    } else {
      reply = {
        card: buildInteractiveCard({
          title: "Miffy · 我没听懂",
          template: "orange",
          sections: [
            "你可以直接发送一个视频链接，我会先建待补充任务。",
            "**也可以试试**\n帮助\n最新\n待补充\n状态",
          ],
          note: "发送“帮助”可以看到全部命令。",
        }),
      };
    }
  } catch (error) {
    reply = {
      card: buildInteractiveCard({
        title: "Miffy · 处理失败",
        template: "red",
        sections: [
          friendlyError(error),
          "发送“帮助”查看命令；如果提示权限不足，需要到飞书开放平台调整权限并发布新版本。",
        ],
        note: "这次操作没有完成；请根据上面的原因处理后重试。",
      }),
    };
  }

  await sendReply(client, incoming.chatId, reply);
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
