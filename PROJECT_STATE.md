# PROJECT_STATE

Updated: 2026-10-18 22:28
Current phase: release

## 一句话现状

Miffy v0.6.0 已完成卡片式群入口的本地验证和 GitHub CI 验证，等待真实飞书群验收。

## 已接受事实

- Miffy 不绕过平台风控、不编造视频分析；复杂分析交给外部 Agent。来源：用户需求与 `decisions.md`。
- 飞书免费长连接可用于群网关，无需公网回调。来源：`src/gateway.mjs` 与 `@larksuiteoapi/node-sdk` 1.76.0 本地类型定义。
- 群通知必须同时包含视频链接和记录链接。来源：用户反馈与 `test/miffy-video.test.mjs`。
- 多维表格 URL 字段的 `link` 是原视频入口，`text` 只是显示文案，不能把显示文案当作链接。来源：`src/gateway.mjs` 与 `test/miffy-video.test.mjs`。
- 2026-10-18 发布前安全扫描：仓库工作区和 Git 历史未发现疑似密钥；25 个疑似候选仅位于本机 Codex 会话日志，不在本次交付面。来源：`scan_secret_candidates.py --git-history --local-ai-logs`。

## 决策索引

- 2026-10-18 - Miffy 定位为入口与看板，不承担平台采集。详见 `decisions.md`。
- 2026-10-18 - 通知必须可操作。详见 `decisions.md`。
- 2026-10-18 - 新链接先进入受限待补充队列。详见 `decisions.md`。
- 2026-10-18 - 群回复采用卡片优先。详见 `decisions.md`。

## 已实现

- 记录链接兜底与群通知升级 - `src/feishu.mjs` - `npm test` 覆盖链接、标题、视频 URL、关键帧结果。
- 卡片式群通知 - `src/feishu.mjs`、`src/feishu-cards.mjs` - 状态标题、正文分区、记录/视频按钮，卡片失败时回退文本。
- 卡片式群命令 - `src/gateway.mjs`、`src/feishu-cards.mjs` - 帮助、看板、最新、待补充、状态、查重、新链接、未知命令和错误均返回可操作卡片；URL 字段优先读取 `link`；卡片失败时保留链接降级为文本。
- 群入口网关 - `src/gateway.mjs` - 支持 `帮助`、`看板`、`最新`、`待补充`、`状态`、`查`、`分析` 和新链接入队；记录查询不依赖新版字段已经补齐。
- CLI 与配置 - `bin/miffy-video.mjs`、`src/config.mjs`、`.env.example`、`package.json` - 新增 `gateway` 命令、`FEISHU_BASE_URL`、`MIFFY_BOT_NAME`。
- 使用说明 - `README.md`、`skills/miffy-video-intel/references/feishu-workbench.md` - 说明长连接配置、命令和行为边界。

## 已验收

- v0.6.0 本地自动化验证 - Codex - `npm run check`、`npm test`（18/18）、`npm run validate:examples`、`npm run dry-run`、`npm audit --omit=dev` 全部通过；`git diff --check` 无输出。
- v0.5.0 GitHub Actions - Codex - 提交 `5f9cd89` 的 Node 20 / 22 verify 均为 success。
- v0.6.0 GitHub Actions - Codex - 提交 `4d7abed` 的 CI、Node 20 verify、Node 22 verify 均为 success。
- 尚未做真实飞书群连接验收，不能声称机器人已在群里可用。

## 未决问题

- P1 - 飞书后台需开启机器人能力、消息收发权限、长连接事件订阅 `im.message.receive_v1`，并把机器人加入目标群。负责人：用户。阻塞：真实群验收。
- P2 - `FEISHU_BASE_URL` 建议填租户实际 Base 地址，保证兜底链接使用正确域名。负责人：用户。
- P1 - 本机 Codex 会话日志存在 25 个疑似凭据候选，未进入仓库或 Git 历史；是否清理日志或轮换凭据需用户决定。负责人：用户。

## 下一步

1. 用户在飞书后台开启机器人能力、消息收发权限、长连接事件订阅 `im.message.receive_v1`，并发布新版本。
2. 用户把 Miffy 加入目标群后运行 `npm run gateway`。验收标准：群里命令返回可点击链接且新链接只生成一条待补充记录。

## 恢复上下文

- 入口命令：`npm run gateway`。
- 验证命令：`npm run check && npm test && npm run validate:examples && npm run dry-run`。
- 已知坑：不要读取或提交 `.env`；中文文件必须显式 UTF-8 读取；当前 Agent 无视觉能力，不能解释关键帧图片。

## 最近更新

- 2026-10-18 - 群入口和写入通知升级为卡片式体验，版本升至 0.6.0。
