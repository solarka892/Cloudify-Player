# SoundCloud `api-v2` — reverse-engineering notes

The **only** documentation for the unstable internal API Cloudify-Player relies on.
Add every new endpoint here with a request example and the response shape. Without
this, the code in `src-tauri/src/sc_api/` is unmaintainable in a month.

> ⚠️ Unofficial. `api-v2.soundcloud.com` is SoundCloud's own internal API (the one
> soundcloud.com uses in the browser). No official key exists. It can break anytime.

- **Base URL:** `https://api-v2.soundcloud.com`
- **Auth for public data:** `client_id` query param (see below).
- **Auth for user data (likes/playlists/...):** OAuth token via
  `Authorization: OAuth <token>` header (not yet reversed — TODO).
- **User-Agent:** send a normal browser UA. Bot-like UAs get different markup.

---

## Recon status (2026-07-27)

Validated with `recon/sc_recon.py` (stdlib-only Python probe). **Approach works** ✅

| Step | Result |
|------|--------|
| Extract `client_id` from JS bundles | ✅ (32-char value, rotates — not stored here) |
| `GET /resolve` public track | ✅ `200`, `kind=track` |
| `GET /search/tracks` | ✅ `200`, real results |

Re-run anytime: `python3 recon/sc_recon.py` (add `--json` for machine output).

---

## Getting `client_id`

1. `GET https://soundcloud.com/` with a browser UA.
2. Extract `<script src="...">` URLs ending in `.js` (bundles are on
   `a-v2.sndcdn.com/assets/`). Homepage currently ships ~11 bundles.
3. Fetch bundles **last-to-first** and regex for `client_id\s*[:=]\s*"([A-Za-z0-9]{20,})"`.
   Currently found in the last chunk (`assets/55-*.js`).
4. Cache it; on `401`/`403` re-extract automatically.

> The `client_id` and bundle filenames rotate. Never hardcode — always re-derive.

---

## Endpoints (verified)

### `GET /resolve` — resolve any soundcloud.com URL to its object

```
GET /resolve?url=https://soundcloud.com/forss/flickermood&client_id=<CID>
```

Returns the full object (`kind` = `track` | `user` | `playlist`).

**Track object — notable fields:**

| Field | Notes |
|-------|-------|
| `id`, `urn`, `permalink_url` | identity |
| `title`, `description`, `genre`, `tag_list` | metadata |
| `duration`, `full_duration` | ms |
| `artwork_url` | replace `-large` with `-t500x500` for hi-res |
| `playback_count`, `likes_count`, `reposts_count`, `comment_count` | stats |
| `user` | nested user object |
| `media.transcodings[]` | **stream sources — see below** |
| `track_authorization` | required token to fetch the stream URL |
| `policy`, `monetization_model`, `streamable` | availability gating |

**`media.transcodings[]`** (for `forss/flickermood`):

| protocol | mime | preset | quality |
|----------|------|--------|---------|
| `progressive` | `audio/mpeg` | `mp3_0_0` | sq |
| `hls` | `audio/mpeg` | `mp3_0_0` | sq |
| `hls` | `audio/mpegurl` | `abr_sq` | sq |
| `hls` | `audio/mp4` (aac) | `aac_160k` | sq |
| `hls` | `audio/mp4` (aac) | `aac_96k` | lq |

Playback plan:
- **`progressive` mp3** → easiest; direct `<audio>`/Web Audio, no HLS needed.
- **`hls` variants** → need `hls.js`. Prefer for adaptive / when progressive absent.
- To get the actual stream URL: `GET <transcoding.url>?client_id=<CID>&track_authorization=<track_authorization>`
  → returns `{ "url": "<signed cdn url>" }`. **(TODO: verify & document.)**

### `GET /search/tracks` — search

```
GET /search/tracks?q=lofi+hip+hop&client_id=<CID>&limit=3
```

Returns `{ collection: [ <track>... ], total_results, next_href }`.
Sibling endpoints (untested but expected): `/search/users`, `/search/playlists`, `/search` (all).

---

## TODO (to reverse next)

- [ ] OAuth flow / token header for private data (likes, playlists, me).
- [ ] `GET /users/{id}/likes` and `/users/{id}/tracks` pagination (`next_href`, `linked_partitioning=1`).
- [ ] Stream URL resolution from a `transcoding.url` (+ `track_authorization`).
- [ ] HLS manifest handling & CDN signing lifetime.
- [ ] Rate limits / when `client_id` gets throttled.
