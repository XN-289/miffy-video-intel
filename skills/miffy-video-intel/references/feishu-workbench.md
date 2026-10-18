# Feishu workbench guide

## Recommended free views

1. `全部视频`: grid view with URL, platform, status, confidence, scores, and update time.
2. `执行看板`: kanban grouped by `采集状态`; put blocked records in `受限待补充`.
3. `视频画册`: gallery view using cover/title/author for quick creative review.
4. `高分对标`: filter `综合潜力 >= 4`, sort by `更新时间`.
5. `待验证`: filter `分析置信度 = 低` or search risks that need completion rate or conversion data.

Feishu free dashboards can add charts by grouping:

- count by `平台`
- average `综合潜力` by `采集Agent`
- count by `采集状态`
- average hook and conversion scores by `平台`

## Record hygiene

- One canonical URL owns one record.
- Do not overwrite evidence with later guesses; append new evidence and update conclusions.
- Keep blocked records until enough materials arrive.
- If product category changes after more evidence, update platform/product fields rather than creating a second record.
- `关键帧证据` is a replace-as-group attachment field: each real upsert writes the successful frame set for that run and does not append old attachments. Check the CLI result for failed frame uploads before treating the evidence set as complete.

## Group gateway

Miffy's group role is entry, dedupe, queueing, and navigation. Use `npm run gateway` and mention the bot in the group:

- `帮助`: command list
- `看板`: Bitable link
- `最新`: latest five records
- `待补充`: blocked evidence queue
- `状态`: record counts
- `查 <video-url>`: normalized URL lookup
- `分析 <video-url>`: external-Agent bootstrap prompt
- `<video-url>`: create a blocked intake record or return the existing record

A new URL is not treated as analysis. It only becomes a `受限待补充` task until an external Agent supplies schema-valid evidence and updates the same canonical URL.

Responses are card-first for readability: status in the card title, record facts in separate sections, and direct buttons for the record, original video, and workbench. The `分析` response remains plain text so it can be copied to another Agent. Errors should point to the shortest recovery path (permissions, Base/Table IDs, or local credentials) instead of exposing a raw stack trace.
If an interactive card is rejected, the gateway retries once with concise text that preserves the same links and next action.
