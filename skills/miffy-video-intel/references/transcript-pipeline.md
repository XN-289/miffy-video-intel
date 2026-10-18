# Xiaohongshu video transcript pipeline reference

This reference records a proven, user-owned pipeline for turning one explicitly provided public Xiaohongshu video note into a transcript. The repository does not vendor or reimplement that pipeline. Use it only when the environment already provides the script and the user has authorized this collection path. It is an auxiliary transcript source, not the video-analysis workflow itself.

Known source script:

```text
~/workspace/notes-hub/xhs_to_text.py
```

Typical use:

```sh
python3 ~/workspace/notes-hub/xhs_to_text.py <xiaohongshu-link>
```

Use `--force` only when the user explicitly asks to rerun a link that the source pipeline has already processed.

## Purpose and boundary

The business objective is not video downloading. Downloading and audio extraction are short-lived technical steps used to obtain a transcript for internal benchmarking. A full Miffy analysis still requires the Agent to inspect the actual video through its allowed browser/player or to receive a user-provided recording/screenshots. Because this source pipeline deletes the media after transcription, its output cannot support visual conclusions by itself.

Allowed:

- one public Xiaohongshu video note explicitly supplied by the user
- the user's existing transcript pipeline when it is installed in that environment
- temporary processing, followed by deletion of media and audio files
- internal storage of the transcript and short evidence quotes for comparison

Stop and create a blocked record when the link is not a public video note, the page requires login, the media address is not exposed to the allowed environment, or the pipeline fails. Do not add cookies, simulate credentials, rotate identities, retry aggressively, bypass risk control, or move the work to a third-party parser site.

Agents must not reimplement transport tricks from memory. The existing script owns page and media access. If it fails, preserve the error category and ask the user for screenshots, a recording, a manual transcript, product details, and comments.

## Pipeline shape

### 1. Resolve one canonical note

The source pipeline follows the supplied share link, identifies the 24-character note ID, and normalizes the address to:

```text
https://www.xiaohongshu.com/explore/<note_id>
```

For Miffy records, use this canonical URL. This helps the Feishu upsert find one record even when the user sends different share variants. Do not batch-crawl related notes or author pages.

### 2. Reuse before reprocessing

The source pipeline keeps a local link database and normally skips a note that has already been transcribed. That behavior is useful:

- If a transcript already exists, reuse it and continue analysis.
- If the user resends the same link, treat it as emphasis, not as permission to duplicate records.
- Rerun only with explicit user confirmation or `--force`.

Miffy's own dedupe key is the normalized URL in Feishu, not the source pipeline's local MD5 fingerprint. Keep both systems pointed at the same canonical note ID.

### 3. Read page metadata cautiously

A public share page may expose title, author, description, publish time, interaction counts, and a media stream address such as `masterUrl`. Treat page structure as unstable.

Validation rules:

- Record fields visible in the final page or pipeline output.
- If an interaction count looks inconsistent, do not silently trust it; write the observed value in `metrics_text` and add a risk.
- The first extracted number is not always the correct metric. Cross-check when the page is visible.
- Missing comments are missing evidence; do not infer audience reactions from the transcript.

### 4. Produce temporary audio

The proven path uses `ffprobe` to read duration and `ffmpeg` to create a 16 kHz mono-channel WAV. This intermediate exists only for transcription.

Do not keep source video or extracted audio in the Miffy repository. If adapting the pipeline, use a temporary directory and delete media after the transcript is written.

### 5. Transcribe with the known local configuration

The source environment uses faster-whisper with the medium model, Chinese language mode, VAD filtering, beam size 5, CPU int8 compute, and a locally prepared model cache.

Known environment failures and fixes:

1. **Model download stalls**: prepare the model files in the user's local tools directory instead of relying on a long interactive Hugging Face download.
2. **Proxy environment breaks httpx**: remove invalid `NO_PROXY` / `no_proxy` values from the transcription subprocess environment. Malformed IPv6 entries can cause `InvalidURL`.
3. **PyAV decoding is fragile**: extract WAV with ffmpeg first, then read PCM with the standard library and NumPy before passing float32 audio to faster-whisper.

These are operational lessons, not instructions to install a new service. If dependencies or the model are absent, report the missing local capability rather than improvising a crawler.

### 6. Archive text, then clean up

The source pipeline writes a Markdown note under its notes hub, updates its local index and link database, prints the transcript, and removes temporary media.

For Miffy, the transcript is evidence, not the final analysis:

- Keep the source note path in the Agent's working notes when available.
- Put verified transcript text in `video.content.transcript`.
- Put concise quotes in `collection.evidence` with source `transcript`.
- Do not publish the full transcript externally; use short evidence quotes internally.
- Mark uncertain words, homophones, and unintelligible segments rather than silently correcting them.

## Mapping to the Miffy JSON contract

Use this mapping after the transcript exists:

- `video.url`: canonical `/explore/<note_id>` URL
- `video.platform`: `xiaohongshu`
- `video.title`: verified page title
- `video.author`: verified author nickname
- `video.description`: visible description, if available
- `video.metrics_text`: visible interaction data, with any metric mismatch risk
- `video.content.transcript`: verified transcript, minimum 30 characters
- `collection.method`: `mixed` when the page and local pipeline are both used
- `collection.access`: `partial` unless the Agent also verifies full visual content and comments
- `collection.evidence[]`: at least two short transcript or page quotes
- `collection.missing[]`: visual beats, comments, product page, purchase path, or performance data that were not visible

A transcript alone permits analysis of spoken strategy only. It does not prove the first frame, on-screen text, product exposure, visual contrast, or comment behavior. Do not infer those details from speech. If visual notes are unavailable:

- do not claim visual mechanisms as facts
- list visual evidence in `collection.missing`
- keep confidence at `medium` or `low`
- cap scores when the missing evidence is material to hook, proof, or conversion

## Failure decision table

| Symptom | Meaning | Miffy action |
| --- | --- | --- |
| Share page requires login | Not publicly accessible under allowed tools | blocked record; request user materials |
| No media address in public page | Image post, changed page structure, or inaccessible media | blocked record; do not guess |
| CDN refuses media transfer | Pipeline transport not accepted in this environment | blocked record; do not rotate headers or identities |
| Image note | Pipeline target is video-only | analyze as image post only if page/materials are visible; otherwise blocked |
| Model or ffmpeg unavailable | Local transcription capability missing | ask user for transcript/recording or install only with explicit permission |
| Transcript contains obvious homophones | Machine output is evidence, not authoritative copy | mark uncertainty; correct only with audio or user confirmation |
| Metrics look inconsistent | Extraction or page ordering may be wrong | preserve observation and add risk |
| Page structure changes | Proven extractor is stale | inspect only the user-supplied public page; otherwise stop and request materials |

## Agent compatibility

- **Muse / Codex / Claude with shell access**: may run the existing user-owned script when installed, then convert the result to the Miffy JSON contract.
- **Browser-only Grok bot**: use only page-visible captions, transcript, screenshots, or user-provided materials. Do not attempt to run or reconstruct the local media pipeline.
- **Miffy Feishu bot**: receives status, links, and notifications. It does not own page access, transcription, or analysis.

The final output must still pass:

```sh
npm run validate -- analyses/<file>.json
npm run upsert -- analyses/<file>.json --dry-run
```
