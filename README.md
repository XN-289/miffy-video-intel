# Miffy Video Intel

Miffy Video Intel is an evidence-first e-commerce benchmark package for Muse, Codex, Claude, Grok bot, and similar Agents. The external Agent does the real page understanding and creative analysis. This package provides the maintained analysis skill, the JSON contract, schema validation, and a Feishu Bitable CLI.

```text
promising e-commerce video link
→ external Agent collects visible evidence
→ Miffy analysis framework v0.4
→ standard JSON record
→ schema validation
→ Feishu Bitable create-or-update by canonical URL
→ Miffy / Bitable views as notification and workbench
```

The package does not contain a Xiaohongshu, Douyin, or Channels scraper. It does not bypass login, risk control, or platform restrictions. When an Agent cannot access a page, it must create a blocked intake record and request screenshots, a recording, transcript, product details, comments, and visible metrics. It must not invent the content.

## Install

Windows PowerShell:

```powershell
git clone https://github.com/XN-289/miffy-video-intel.git
cd miffy-video-intel
.\install.ps1
```

macOS, Linux, container, or clean VM:

```sh
git clone https://github.com/XN-289/miffy-video-intel.git
cd miffy-video-intel
sh install.sh
```

Use `sh install.sh` on Linux even if the executable bit was lost while committing from Windows.

The installer checks Node.js 20+, installs npm dependencies, creates `.env` from `.env.example` when needed, and installs the skill. To install only the CLI:

```sh
MIFFY_SKIP_SKILL_INSTALL=1 sh install.sh
```

### Skill destinations

Default Codex destination:

```text
${CODEX_HOME:-$HOME/.codex}/skills/miffy-video-intel
```

Explicit destinations:

```sh
MIFFY_SKILLS_DIR=/path/to/skills sh install.sh
CLAUDE_SKILLS_DIR=/path/to/skills sh install.sh
MUSE_SKILLS_DIR=/path/to/skills sh install.sh
```

The script replaces each destination's `miffy-video-intel` directory, so Agents do not keep reading stale reference files. Claude and Muse are installed only when their directory is explicit or already present.

## VM and container Agents

This package assumes the Agent may run in a disposable Linux VM rather than on the owner's Windows machine.

Minimal install:

```sh
git clone https://github.com/XN-289/miffy-video-intel.git
cd miffy-video-intel
MIFFY_SKIP_SKILL_INSTALL=1 sh install.sh
export MIFFY_VIDEO_INTEL_HOME="$PWD"
```

Configuration locations:

- `MIFFY_VIDEO_INTEL_HOME`: repository root when the Agent runs commands from another directory.
- `MIFFY_CONFIG_HOME`: directory containing a mounted or injected `.env`.
- Current working directory: useful when the Agent is already inside the repository.
- Repository root `.env`: fallback for local development.

Runtime process environment variables always win. File precedence, from lowest to highest, is repository root, `MIFFY_VIDEO_INTEL_HOME`, `MIFFY_CONFIG_HOME`, then current directory. The configuration filename is always `.env` inside the chosen directory.

For a VM, mount a secret directory rather than baking credentials into the image:

```sh
export MIFFY_CONFIG_HOME=/run/secrets/miffy
node "$MIFFY_VIDEO_INTEL_HOME/bin/miffy-video.mjs" doctor
```

Secret handling:

- Do not commit `.env`, print its values, copy them into chat, or bake them into a Docker image.
- The CLI process is allowed to read its configured `.env` internally.
- Agents should not manually open or quote the file.
- In hosted environments, inject Feishu values through the runtime's secret mechanism.

## Agent bootstrap prompt

Send this to an Agent that can execute commands and read files:

```text
Install and enable miffy-video-intel:

1. Clone or enter this repository.
2. On Windows run .\install.ps1. On Linux/macOS/VM run:
   MIFFY_SKIP_SKILL_INSTALL=1 sh install.sh
3. Set MIFFY_VIDEO_INTEL_HOME to the repository root.
4. If credentials are provided by the runtime, set MIFFY_CONFIG_HOME to the directory containing .env. Never print or commit credentials.
5. Read skills/miffy-video-intel/SKILL.md and references/analysis-framework.md.
6. When I send a video link, open the page and inspect the actual video with your allowed browser/player. Record timestamped visual beats; do not treat metadata, cover, or transcript as a full video analysis. If access is blocked, create a blocked record and ask me for evidence instead of guessing.
7. Analyze with the v0.4 framework, write a schema-valid JSON file, run validate, then run upsert --dry-run unless I explicitly request a real Feishu write.
```

Agent roles:

- **Muse / Codex / Claude**: run the installer, inspect the skill, call the CLI, and write records.
- **Grok bot or browser-only Agent**: follow `references/analysis-prompt.md`, output the complete JSON, and hand it to an Agent that can run validation and upsert.
- **Miffy Feishu bot**: group entry, status, notifications, and workbench link. It does not pretend to scrape or analyze inaccessible platforms.

## Analysis kernel

The maintained framework is [skills/miffy-video-intel/references/analysis-framework.md](skills/miffy-video-intel/references/analysis-framework.md). Its v0.4 focus:

- business diagnosis before content praise
- direct video review with timestamped evidence in a normal viewer pass and an operator pass
- video hooks in 0-3s, 3-15s, 15-40s, and closing conversion
- image-post cover, title, slide funnel, body, and comment path
- at least three hidden operator details with evidence and verification
- comment mining for real purchase intent and objections
- non-copyable risks such as survivor bias, margin, supply, claims, and saturation
- 3-7 concrete benchmark actions
- one minimum-resource shooting script
- compliant comment handling and a testable learning hypothesis

[references/analysis-prompt.md](skills/miffy-video-intel/references/analysis-prompt.md) is the compact version for external Agents. Keep prompt improvements in these files rather than in a private chat.

## Existing transcript pipeline

If the user's environment already provides `~/workspace/notes-hub/xhs_to_text.py`, Agents can use it only for one explicitly supplied public Xiaohongshu video note. [references/transcript-pipeline.md](skills/miffy-video-intel/references/transcript-pipeline.md) records the proven six-step shape, local transcription pitfalls, cleanup rule, JSON mapping, and failure decision table.

The pipeline produces evidence, not a final benchmark. A transcript alone does not prove the first frame, on-screen text, product exposure, or comments. Missing visual and comment evidence must remain explicit in the record.

## Douyin collection

For Douyin videos there is no bundled scraper either. [references/douyin-collection.md](skills/miffy-video-intel/references/douyin-collection.md) records the guest collection route verified on 2026-10-18: resolve the short link, take structured facts and the commerce anchor from the app feed endpoint, download the signed video URL immediately to a persistent directory, transcribe locally, and delete the media after the frame pass. The route is guest-only and never uses the user's Douyin cookie; when it fails, the outcome is a blocked record, not a workaround through the user's account.

## Feishu configuration

Use one Feishu self-built app with Bitable read/write permission. Add group messaging only if notifications are needed. For `关键帧证据`, also enable the cloud-document media upload/download permission and publish the app version. The app must be authorized for the target Bitable.

`.env` values:

```text
FEISHU_APP_ID=app id
FEISHU_APP_SECRET=app secret
FEISHU_BASE_ID=Bitable app_token
FEISHU_TABLE_ID=Bitable table_id
FEISHU_CHAT_ID=optional chat_id for notifications
MIFFY_DEFAULT_AGENT=default collector name
MIFFY_DEFAULT_MODEL=default model name
```

To create a new workbench:

```sh
npm run init --
```

Copy the returned `app_token` and `table_id` into the runtime secret store. To continue using an existing Bitable, configure its existing values.

`关键帧证据` is a Bitable attachment field. `video.evidence_images` is optional and backward-compatible: legacy JSON remains valid. Each item uses a repository-relative `path`, `timestamp_seconds`, and evidence `label`. A real upsert uploads valid JPGs through Feishu's media API and writes their `file_token`s as one complete attachment group, so repeated updates replace rather than accumulate. `--dry-run` only lists the local files it would upload. A failed image upload is reported in `attachments.failed` and does not stop the text record from being created or updated.

## Usage

1. Send a video link to an Agent with the skill installed.
2. The Agent collects title, author, description, metrics, product, transcript, visual beats, comments, and evidence.
3. It writes:
   - complete record: `analyses/<platform>-<video-id>.json`
   - blocked record: `analyses/<platform>-<video-id>.blocked.json`
4. Validate:

   ```sh
   npm run validate -- analyses/example.json
   ```

5. Preview mapped Feishu fields without credentials:

   ```sh
   npm run upsert -- analyses/example.json --dry-run
   ```

6. Create or update the real record:

   ```sh
   npm run upsert -- analyses/example.json
   ```

URL matching removes tokens such as `xsec_token` and `utm_*`, so the same content updates one record instead of creating duplicates.

Key-frame files live under `analyses/assets/<video-id>/`, use `<video-id>-<timestamp-seconds>s-<label>.jpg`, and must be JPGs no wider than 720px and no larger than 500KB. Select at most seven: opening frame, one representative frame per content section, and the closing conversion frame.

## Blocked intake

When the page is inaccessible, the record status is `受限待补充`. Ask for:

- screenshots or a short recording
- transcript or main visual beats
- product name, price,卖点, purchase path
- high-like comments and recurring doubts
- visible metrics

After the user supplies evidence, upgrade the blocked record to a complete analysis and upsert the same canonical URL.

## Free Bitable workbench

`npm run init` creates the main table, execution kanban, and gallery. Useful free views:

- `全部视频`: URL, platform, status, confidence, scores, update time
- `高分对标`: `综合潜力 >= 4`, latest first
- `待验证`: low confidence or unresolved risks
- `受限待补充`: evidence request queue

Free dashboards can chart:

- count and average scores by platform
- count by collection status
- average hook and conversion strength
- benchmark action outcomes by collector Agent and model

Keep evidence excerpts and the JSON summary in the table. They make later score calibration possible.

## Verification

```sh
npm run check
npm test
npm run validate:examples
npm run dry-run
npm run doctor
npm audit --omit=dev
```

GitHub Actions runs these checks on Ubuntu with Node 20 and 22, syntax-checks `install.sh`, and executes a credential-free install with:

```sh
MIFFY_SKIP_SKILL_INSTALL=1 sh install.sh
```

No Feishu secret is required by CI.
