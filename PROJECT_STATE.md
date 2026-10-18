# PROJECT_STATE

Updated: 2026-10-18 22:14
Current phase: handoff

## 一句话现状

Miffy v0.5.0 已实现并推送可操作的群入口、记录链接、待补充队列和外部 Agent 任务提示词，等待用户完成飞书后台配置后实测。

## 已接受事实

- Miffy 不绕过平台风控、不编造视频分析；复杂分析交给外部 Agent。来源：用户需求与 `decisions.md`。
- 飞书免费长连接可用于群网关，无需公网回调。来源：`src/gateway.mjs` 与 `@larksuiteoapi/node-sdk` 1.76.0 本地类型定义。
- 群通知必须同时包含视频链接和记录链接。来源：用户反馈与 `test/miffy-video.test.mjs`。

## 决策索引

- 2026-10-18 - Miffy 定位为入口与看板，不承担平台采集。详见 `decisions.md`。
- 2026-10-18 - 通知必须可操作。详见 `decisions.md`。
- 2026-10-18 - 新链接先进入受限待补充队列。详见 `decisions.md`。

## 已实现

- 记录链接兜底与群通知升级 - `src/feishu.mjs` - `npm test` 覆盖链接、标题、视频 URL、关键帧结果。
- 群入口网关 - `src/gateway.mjs` - 支持 `帮助`、`看板`、`最新`、`待补充`、`状态`、`查`、`分析` 和新链接入队；记录查询不依赖新版字段已经补齐。
- CLI 与配置 - `bin/miffy-video.mjs`、`src/config.mjs`、`.env.example`、`package.json` - 新增 `gateway` 命令、`FEISHU_BASE_URL`、`MIFFY_BOT_NAME`。
- 使用说明 - `README.md`、`skills/miffy-video-intel/references/feishu-workbench.md` - 说明长连接配置、命令和行为边界。

## 已验收

- 本地自动化验证 - Codex - `npm run check`、`npm test`、`npm run validate:examples`、`npm run dry-run`、`npm audit --omit=dev` 全部通过。
- GitHub Actions - Codex - 提交 `5f9cd89` 的 Node 20 / 22 verify 均为 success。
- 尚未做真实飞书群连接验收，不能声称机器人已在群里可用。

## 未决问题

- P1 - 飞书后台需开启机器人能力、消息收发权限、长连接事件订阅 `im.message.receive_v1`，并把机器人加入目标群。负责人：用户。阻塞：真实群验收。
- P2 - `FEISHU_BASE_URL` 建议填租户实际 Base 地址，保证兜底链接使用正确域名。负责人：用户。

## 下一步

1. 用户在飞书后台开启机器人能力、消息收发权限、长连接事件订阅 `im.message.receive_v1`，并发布新版本。
2. 用户把 Miffy 加入目标群后运行 `npm run gateway`。验收标准：群里命令返回可点击链接且新链接只生成一条待补充记录。

## 恢复上下文

- 入口命令：`npm run gateway`。
- 验证命令：`npm run check && npm test && npm run validate:examples && npm run dry-run`。
- 已知坑：不要读取或提交 `.env`；中文文件必须显式 UTF-8 读取；当前 Agent 无视觉能力，不能解释关键帧图片。

## 最近更新

- 2026-10-18 - 新增群网关、可操作通知和待补充队列，版本升至 0.5.0。
