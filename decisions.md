# Decisions

## 2026-10-18 - Miffy is an entry and workbench, not a collector

Miffy may create blocked intake records, deduplicate normalized video URLs, return Feishu links, and hand analysis work to external Agents. It must not bypass Xiaohongshu, Douyin, or Channels access controls, and it must not invent page, comment, video, or conversion facts.

## 2026-10-18 - Notifications must be actionable

Every created or updated group notification includes the action, status, title or URL, original video URL, direct Bitable record URL, and attachment result. If Feishu does not return `record_url`, the CLI constructs a Base URL with `table` and `record` parameters.

## 2026-10-18 - New group links enter the blocked queue

A new link mentioned in the group creates one schema-valid blocked record. The same normalized URL is reused later when an external Agent supplies a complete or blocked analysis, instead of creating duplicate records.
