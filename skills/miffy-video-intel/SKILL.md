---
name: miffy-video-intel
description: Analyze Xiaohongshu, Douyin, and Channels e-commerce short videos with evidence-first collection, produce the Miffy JSON contract, validate it, and upsert the result to Feishu Bitable.
---

# Miffy Video Intel

Use this skill when the user provides a short-video link and wants the team to learn from it for their own e-commerce shop. The project repo contains the schema, Feishu CLI, and the maintained analysis framework.

## Non-negotiable evidence rule

1. First try to open the page with the Agent's own browser capability.
2. If the page is blocked or requires login, do not spoof a browser, do not bypass platform risk control, and do not infer the video from the URL.
3. Immediately produce `templates/blocked-video.example.json` as the output shape, then ask the user for:
   - video screenshots or a short recording
   - transcript or main visual beats
   - product information and price range
   - top comments
   - visible metrics
4. A complete analysis requires the URL, platform, title, and at least one of:
   - a transcript of at least 30 characters
   - at least two concrete visual notes
5. Every inference must be traceable to evidence in `collection.evidence`. Write "unknown" or add a risk instead of guessing.

## Workflow

1. Resolve the repository root. Use the current directory if it contains `package.json`; otherwise use `MIFFY_VIDEO_INTEL_HOME`.
2. Collect visible facts with the Agent browser. Capture title, author, description, metrics, comments, product details, transcript, and visual beats when available.
3. Analyze according to `references/analysis-framework.md`. When another Agent needs a compact reusable prompt, use `references/analysis-prompt.md`.
4. Write one JSON file under `analyses/`:
   - complete record: `analyses/<platform>-<video-id>.json`
   - blocked record: `analyses/<platform>-<video-id>.blocked.json`
5. Select key-frame evidence images while inspecting frames. Rules:
   - Key frames only, never the full frame dump. At most 7 images: the opening frame, one frame per content segment that best proves its hook, mechanism, or turning point, and the closing conversion card.
   - Save them under `analyses/assets/<video-id>/`, compressed: JPG, width at most 720px, at most 500KB each, named `<video-id>-<timestamp-seconds>s-<slug>.jpg`.
   - Record each one in `video.evidence_images` as `{path, timestamp_seconds, label}`. `path` is relative to the record JSON file. `label` states what this frame proves, not what it shows.
   - On upsert the CLI uploads these files into the Bitable attachment field `关键帧证据`. A dry-run only lists the planned uploads.
6. Validate:

   ```bash
   npm run validate -- analyses/<file>.json
   ```

7. Preview the shared Feishu workbench fields:

   ```bash
   npm run upsert -- analyses/<file>.json --dry-run
   ```

   Run a real upsert only when the user or the active workflow explicitly authorizes writing to Feishu:

   ```bash
   npm run upsert -- analyses/<file>.json
   ```
8. Return the record link and the three most useful actions. Do not print Feishu secrets.

## Agent adaptation

- If the Agent cannot run shell commands, output the complete JSON and ask the user to run validation/upsert.
- If the Agent has multimodal tools, inspect screenshots before analysis.
- If the user provides new outcome data such as views, completion rate, or sales, update the record JSON and rerun upsert rather than creating a duplicate.
- If the framework produces an inaccurate conclusion, update `references/analysis-framework.md` in the repository and explain the correction. Do not silently keep a private prompt variant.

## Feishu workbench

The table is the comparison system, not just storage. Keep these practices:

- One URL has one record; use upsert, never duplicate.
- Keep `采集状态` and `分析置信度` honest.
- Use score fields to compare hooks, product-scene fit, conversion, and replicability.
- Put unresolved questions in `风险与待验证`.
- Preserve original evidence in `证据摘录` so future agents can revisit conclusions.
