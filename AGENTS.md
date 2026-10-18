# Agent rules

1. Read `skills/miffy-video-intel/SKILL.md` before analyzing a video.
2. Do not fabricate video content. If the page is blocked, create a blocked record and ask for screenshots, transcript, product information, or comments.
3. A complete analysis requires enough evidence and must pass `npm run validate -- <file>`.
4. Preview with `miffy-video upsert <file> --dry-run`; run a real upsert only when Feishu writing is explicitly authorized.
5. Keep the skill and analysis framework in this repository; do not fork the prompt silently in chats.
6. The CLI process may read its configured `.env`; Agents must not manually open, print, copy, or commit it.
7. Resolve the repository with `MIFFY_VIDEO_INTEL_HOME` when commands run outside the repository, and use `MIFFY_CONFIG_HOME` for a runtime-mounted config directory.
8. Before using the existing Xiaohongshu transcript pipeline, read `skills/miffy-video-intel/references/transcript-pipeline.md` and apply its access, cleanup, and evidence-mapping rules.
