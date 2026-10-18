function plainText(value) {
  return { tag: "plain_text", content: String(value || "") };
}

export function markdownLink(label, url) {
  if (!url) return "";
  const safeLabel = String(label || "打开链接").replace(/[[\]]/g, " ");
  return `[${safeLabel}](${url})`;
}

export function actionButton(text, url, type = "default") {
  return {
    tag: "button",
    text: plainText(text),
    type,
    url,
    value: { action: "open_url" },
  };
}

export function buildInteractiveCard({ title, template = "blue", sections = [], actions = [], note = "" }) {
  const elements = sections
    .filter((section) => String(section || "").trim())
    .map((section) => ({ tag: "div", text: { tag: "lark_md", content: section } }));

  if (actions.length) {
    elements.push({ tag: "action", actions });
  }
  if (note) {
    elements.push({ tag: "note", elements: [plainText(note)] });
  }
  if (!elements.length) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: "暂无内容" } });
  }

  return {
    config: { wide_screen_mode: true },
    header: { template, title: plainText(title) },
    elements,
  };
}

export function cardToPlainText(card) {
  const lines = [];
  const title = card?.header?.title?.content;
  if (title) lines.push(String(title));

  for (const element of card?.elements || []) {
    if (element.tag === "div" && element.text?.tag === "lark_md") {
      lines.push(String(element.text.content || "")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1：$2")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1"));
    } else if (element.tag === "action") {
      for (const action of element.actions || []) {
        if (action?.url) lines.push(`${action.text?.content || "打开链接"}：${action.url}`);
      }
    } else if (element.tag === "note") {
      for (const noteElement of element.elements || []) {
        if (noteElement?.content) lines.push(String(noteElement.content));
      }
    }
  }
  return lines.filter((line) => line.trim()).join("\n\n");
}
