# Douyin video collection reference

This reference records a guest-access route for turning one explicitly user-provided public Douyin video into the evidence a Miffy analysis needs: structured page facts, the product anchor, a downloadable video file for frame inspection, and a transcript. It was verified end-to-end once on 2026-10-18 against a live commerce video; the app endpoint is unofficial and brittle, so treat future failures as expected. The repository does not vendor a scraper; the steps below are performed by the Agent with ordinary HTTP tools and, where noted, a guest browser session.

## Purpose and boundary

The objective is evidence collection for one benchmark video the user supplied. It is not bulk crawling, account automation, or a download service.

Allowed:

- one public Douyin video explicitly supplied by the user (short link or full URL)
- guest access only; no login, no account, no user cookies
- temporary local processing (frame extraction, transcription), followed by deletion of the media file
- storing the transcript, structured facts, and short evidence quotes for the analysis record

Never:

- ask the user for their Douyin cookie or session. The user's account is real-name verified; this is a standing user rule, not a preference.
- simulate credentials, rotate identities to evade a block, or retry aggressively after a platform refusal
- treat a transcript or metadata as a visual analysis; the frame-verification pass in the skill workflow still applies

Stop and create a blocked record when the video is private or deleted, when every route below fails, or when the only remaining route would require the user's credentials.

Platform refusal means refusal. Do not change device or install identifiers, add signing, rotate user agents or proxies, or make repeated attempts to recover the same route.

## Route

### 1. Resolve the short link

`v.douyin.com` links redirect to the share page and expose the aweme id without any login:

```sh
curl -s -I 'https://v.douyin.com/<code>/' -A '<mobile UA>'
# Location: https://www.iesdouyin.com/share/video/<aweme_id>/?...&is_ec_shopping=1...
```

Keep the aweme id; the canonical record URL is `https://www.douyin.com/video/<aweme_id>`. Share parameters such as `is_ec_shopping=1` are an early hint that the video carries a commerce anchor.

### 2. Do not rely on the web share page for data

Verified 2026-10-18: the share page's embedded `_ROUTER_DATA` contains no item payload (mobile and desktop UAs alike); the legacy `iesdouyin.com/web/api/v2/aweme/iteminfo` endpoint answers `status_code 11110 (encrypt_data_miss)`; the web detail API requires platform request signing and rejects direct calls; generic downloaders (yt-dlp) may fail from datacenter egress with cookie demands. A guest browser session can read rendered metadata and comments and can play the video, but in tooling without network-response access it cannot yield the video file URL. Use the browser for comment sampling when needed, not as the data backbone.

### 3. Fetch structured data from the app feed endpoint

The app feed endpoint has answered unsigned guest requests that carry inert numeric device placeholders:

```sh
curl -sS --fail --max-time 30 'https://aweme.snssdk.com/aweme/v1/feed/?aweme_id=<aweme_id>&device_platform=android&os=android&ssmix=a&device_type=Pixel%207&device_brand=google&language=zh&os_api=33&os_version=13&manifest_version_code=290101&resolution=1080*2400&dpi=420&update_version_code=29109900&app_name=aweme&version_name=29.1.0&version_code=290100&device_id=0&iid=0&aid=1128' \
  -A 'com.ss.android.ugc.aweme/290100'
```

Make at most one properly formed request for the supplied video. The response `aweme_list` must be valid JSON, contain the target item, and have an entry whose `aweme_id` exactly matches; otherwise stop and create a blocked record. From that matching entry take:

- `desc`, `author.nickname`, `create_time`
- `statistics`: `digg_count`, `collect_count`, `comment_count`, `share_count` (exact integers; no thousand-separator truncation)
- `video.play_addr.url_list` and `video.bit_rate[].play_addr.url_list` (pick the widest, usually 720p)
- for commerce videos, `anchor_info.extra` is a JSON string holding the promotion record: product `title`, `product_id`, `shop_id`, cumulative `sales`, price tags, and the anchor's in-video first-appearance second (`first_time`)

Keep `device_id=0` and `iid=0` as literal inert placeholders. Do not generate plausible device/install identifiers, vary them after a failure, or claim that this is an officially supported API. The request is made without any user credential.

### 4. Download immediately, to a persistent directory

The CDN URLs are signed and expire quickly (minutes to a few hours). Download in the same working session, with the app user agent and a Douyin referer, into the workspace's persistent work area — never `/tmp`, which the runtime may wipe mid-task:

```sh
curl -sS --fail --location --max-time 120 '<bit_rate url>' -A 'com.ss.android.ugc.aweme/290100' -e 'https://www.douyin.com/' -o video.mp4
```

Before processing, verify that the file is non-empty and readable as a video/audio container with `ffprobe`. A saved error page is not evidence. If verification or any later processing step fails, remove the partial download, audio, and any extracted temporary files, then create a blocked or partial record according to the evidence actually obtained.

### 5. Transcript and frames

Douyin exposes no official subtitles on this route. Transcribe the downloaded audio locally (for example faster-whisper) and record the transcript source honestly in `collection` as a local ASR transcript, not as platform subtitles. Extract frames for the visual pass per the skill workflow, select at most seven key frames into `analyses/assets/<aweme_id>/`, then delete the video and audio files; keep only the transcript, notes, and key frames.

### 6. Comments

The app comment endpoints did not return data in our 2026-10-18 test. Fall back to the comments a guest browser session can see, mark `collection.access` as `partial`, and list the comment limitation under `missing_evidence`. Do not present a visible subset as the full comment set.

## Evidence mapping

- Structured facts from step 3 are `page`/`video` evidence in the record's `collection.evidence`; the promotion record is `product_page` evidence.
- Frame conclusions must cite the frame timestamps the Agent actually inspected; the ASR transcript is `transcript` evidence with medium confidence at best.
- If step 3 fails and no route yields the video file, produce a blocked record instead of analyzing from the title or cover alone.
