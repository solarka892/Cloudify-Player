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

### Resolving a transcoding to a playable URL ✅ verified (2026-07-27)

```
GET <transcoding.url>?client_id=<CID>&track_authorization=<track.track_authorization>
→ 200 { "url": "<signed CDN url>" }
```

| transcoding | resolved CDN host | notes |
|-------------|-------------------|-------|
| `progressive` mp3 | `cf-media.sndcdn.com/<id>.128.mp3?Policy=...` | signed; supports HTTP Range → `206`. First bytes `FF FB` = real MP3. Play directly. |
| `hls` mp3 | `cf-hls-media.sndcdn.com/playlist/<id>.128.mp3/playlist...` | m3u8 → `hls.js` |
| `hls` aac | `playback.media-streaming.soundcloud.cloud/<id>/aac_...` | m3u8 → `hls.js` |
| `hls` `audio/mpegurl` (`abr_sq`) | — | returned **404** on resolve; skip this preset. |

> The signed CDN URL is short-lived — resolve it lazily right before playback,
> don't cache it. `track_authorization` comes from the track object itself.

### `GET /search/tracks` — search

```
GET /search/tracks?q=lofi+hip+hop&client_id=<CID>&limit=3
```

Returns `{ collection: [ <track>... ], total_results, next_href }`.
Sibling endpoints (untested but expected): `/search/users`, `/search/playlists`, `/search` (all).

### `GET /users/{id}/likes` — a user's likes ✅ verified (2026-07-27)

```
GET /users/{id}/likes?client_id=<CID>&limit=2&linked_partitioning=1
```

Returns `{ collection: [ { kind: "like", created_at, track?|playlist? } ], next_href }`.
Works with **just `client_id` for public users** — no auth needed. Each item wraps
either a `track` or a `playlist` object.

**Pagination:** pass `linked_partitioning=1`; follow `next_href` (already a full URL
with cursor) until it's absent. Sibling: `/users/{id}/tracks` (own uploads).

---

## Auth model (what needs OAuth vs. not)

- **`client_id` only** (no login): resolve, search, public user likes/tracks/playlists,
  stream URL resolution, playback. — All verified working.
- **OAuth token** (`Authorization: OAuth <token>`): the *logged-in user's* own data and
  actions — `/me`, private tracks, liking/reposting/following, personal feed.

---

## TODO (to reverse next)

- [ ] OAuth flow / token header for private data (`/me`, like/repost/follow actions).
- [x] ~~`/users/{id}/likes` pagination~~ — done (`linked_partitioning=1` + `next_href`).
- [x] ~~Stream URL resolution from a `transcoding.url`~~ — done (see above).
- [ ] HLS manifest handling in the app (`hls.js`) & CDN signing lifetime (URLs expire).
- [ ] Rate limits / when `client_id` gets throttled.
- [ ] `/search/users`, `/search/playlists` (expected to work, untested).
