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
