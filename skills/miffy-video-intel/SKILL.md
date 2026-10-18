---
name: miffy-video-intel
description: Analyze Xiaohongshu, Douyin, and Channels e-commerce short videos with evidence-first collection, produce the Miffy JSON contract, validate it, and upsert the result to Feishu Bitable.
---

# Miffy Video Intel

Use this skill when the user provides a short-video link and wants the team to learn from it for their own e-commerce shop. The project repo contains the schema, Feishu CLI, and the maintained analysis framework.

## Non-negotiable evidence rule

1. First try to open the page with the Agent's own browser capability.
2. For a video link, inspect the actual video in the allowed browser/player or an explicitly supplied recording. Page metadata, a cover image, or a transcript alone is not a full video analysis.
3. If the page is blocked or requires login, do not spoof a browser, do not bypass platform risk control, and do not infer the video from the URL.
4. Immediately produce `templates/blocked-video.example.json` as the output shape, then ask the user for:
   - video screenshots or a short recording
   - transcript or main visual beats
   - product information and price range
   - top comments
   - visible metrics
5. A complete record requires the URL, platform, title, and at least one of:
   - a transcript of at least 30 characters
   - at least two concrete visual notes
6. To claim a full visual analysis, the Agent must have watched the video or user-provided recording and produced timestamped visual notes. Otherwise mark `collection.access` as `partial`, list the missing visual evidence, and cap relevant scores.
7. Every inference must be traceable to evidence in `collection.evidence`. Write "unknown" or add a risk instead of guessing.
8. Do not manufacture key-frame evidence without direct video or recording access. An Agent without visual/video capability must leave `video.evidence_images` empty and report the missing visual evidence; it must not inspect or interpret unrelated images to fill the field.

## Workflow

1. Resolve the repository root. Use the current directory if it contains `package.json`; otherwise use `MIFFY_VIDEO_INTEL_HOME`.
2. Open the page and inspect the actual video with the Agent's allowed browser/player. Watch the whole video once for the viewer experience, then replay key sections to capture timestamped visual beats, spoken words, on-screen text, sound, editing rhythm, product exposure, proof, and the closing CTA.
3. Collect visible page facts: title, author, description, metrics, comments, product details, and purchase path. For a Xiaohongshu video where the user's existing transcript pipeline is available, use it only as an auxiliary transcript source and follow `references/transcript-pipeline.md`; it does not replace direct video inspection. For a Douyin video, follow `references/douyin-collection.md` for the guest collection route (structured data, product anchor, immediate download, local transcription); never ask the user for a Douyin cookie.
4. During the frame-verification pass, select at most seven key frames: opening frame, the strongest representative frame for each content section, and the closing conversion frame. Do not extract or upload the full frame set. Save each as a JPG no wider than 720px and no larger than 500KB under `analyses/assets/<video-id>/`, name it `<video-id>-<timestamp-seconds>s-<label>.jpg`, and add it to optional `video.evidence_images` with `path`, `timestamp_seconds`, and a specific evidence `label`. The label must say what the frame proves, such as the visible hook, mechanism, product exposure, proof, or CTA.
5. Analyze according to `references/analysis-framework.md`. When another Agent needs a compact reusable prompt, use `references/analysis-prompt.md`.
6. Write one JSON file under `analyses/`:
   - complete record: `analyses/<platform>-<video-id>.json`
   - blocked record: `analyses/<platform>-<video-id>.blocked.json`
7. Validate:

   ```bash
   npm run validate -- analyses/<file>.json
   ```

8. Preview the shared Feishu workbench fields:

   ```bash
   npm run upsert -- analyses/<file>.json --dry-run
   ```

   Run a real upsert only when the user or the active workflow explicitly authorizes writing to Feishu:

   ```bash
   npm run upsert -- analyses/<file>.json
   ```
9. Return the record link and the three most useful actions. Do not print Feishu secrets.

## Agent adaptation

- If the Agent cannot run shell commands, output the complete JSON and ask the user to run validation/upsert.
- If the Agent has multimodal tools, inspect the actual video or the supplied recording/screenshots before analysis; do not analyze only the cover image or transcript.
- If the user provides new outcome data such as views, completion rate, or sales, update the record JSON and rerun upsert rather than creating a duplicate.
- If the framework produces an inaccurate conclusion, update `references/analysis-framework.md` in the repository and explain the correction. Do not silently keep a private prompt variant.

## Feishu workbench

The table is the comparison system, not just storage. Keep these practices:

- One URL has one record; use upsert, never duplicate.
- Keep `采集状态` and `分析置信度` honest.
- Use score fields to compare hooks, product-scene fit, conversion, and replicability.
- Put unresolved questions in `风险与待验证`.
- Preserve original evidence in `证据摘录` so future agents can revisit conclusions.
- `关键帧证据` stores up to seven compressed JPG attachments. A real upsert replaces the whole attachment group; upload failures are reported without blocking the text record.
