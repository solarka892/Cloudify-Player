# SoundCloud `api-v2` — reverse-engineering notes

The **only** documentation for the unstable internal API Cloudify-Player relies on.
Add every new endpoint here with a request example and the response shape. Without
this, the code in `src-tauri/src/sc_api/` is unmaintainable in a month.

> ⚠️ Unofficial. `api-v2.soundcloud.com` is SoundCloud's own internal API (the one
> soundcloud.com uses in the browser). No official key exists. It can break anytime.

- **Base URL:** `https://api-v2.soundcloud.com`
- **Auth for public data:** `client_id` query param (see below).
- **Auth for user data (`/me`, private items, actions):** OAuth token via
  `Authorization: OAuth <token>` header — see "Auth model" below. Most
  read-only user data (likes, playlists, followings) is public and needs only
  `client_id`; we send the token anyway so private items show up.
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

Implemented in Rust: `src-tauri/src/sc_api/client_id.rs` (in-memory cache, 24h
TTL, `force` bypass). Exposed via the `get_client_id` Tauri command.

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

### `GET /search/{tracks,users,playlists}` — search ✅ verified (2026-07-27)

```
GET /search/tracks?q=lofi&client_id=<CID>&limit=50&offset=0
GET /search/users?q=forss&client_id=<CID>&limit=50&offset=0
GET /search/playlists?q=lofi&client_id=<CID>&limit=50&offset=0
```

All three return `{ collection: [ <object>... ], total_results, next_href }`
and hold the objects directly (no `like`-style wrapper). **No login needed.**

**Paging is by numeric `offset`** — SoundCloud's own `next_href` is just
`…&limit=50&offset=50`, verified to return non-overlapping pages. We therefore
expose `offset` (a number) to the frontend instead of a cursor URL, keeping
api-v2 URLs out of the UI layer.

Implemented: `sc_api::search::{search_tracks, search_users, search_playlists}`
sharing one generic `search()`; returns `SearchPage { items, next_offset, total }`.
Blank query short-circuits without a request, `limit` clamped to 200. Commands
`sc_search_tracks` / `sc_search_users` / `sc_search_playlists`; the UI debounces
350 ms and pages with a "load more" button.

`/search` (all kinds at once) still untested — the UI filters by kind anyway.

### `GET /users/{id}/likes` — a user's likes ✅ verified (2026-07-27)

```
GET /users/{id}/likes?client_id=<CID>&limit=2&linked_partitioning=1
```

Returns `{ collection: [ { kind: "like", created_at, track?|playlist? } ], next_href }`.
Works with **just `client_id` for public users** — no auth needed. Each item wraps
either a `track` or a `playlist` object.

**Pagination:** pass `linked_partitioning=1`; follow `next_href` (already a full URL
with cursor) until it's absent. Sibling: `/users/{id}/tracks` (own uploads).

Implemented: `sc_api::likes::get_liked_tracks` — extracts `.track`, skips
playlist likes. Command `sc_get_likes`. **TODO:** stream pages to the UI /
infinite scroll instead of one blocking full fetch.

Paging for this and every other collection endpoint lives in one place:
`sc_api::paging::collect_all` (`linked_partitioning=1`, 200/page, follows
`next_href`, capped at `max`, sends the OAuth token when given one).

### `GET /users/{id}/playlist_likes` — liked playlists ✅ verified (2026-07-27)

```
GET /users/{id}/playlist_likes?client_id=<CID>&limit=200&linked_partitioning=1
```

Returns `{ collection: [ { kind: "like", created_at, playlist } ], next_href }` —
the playlist-only counterpart of `/users/{id}/likes`.
Implemented: `sc_api::likes::get_liked_playlists`, command `sc_get_liked_playlists`.

### `GET /users/{id}/playlists` — playlists a user created ✅ verified (2026-07-27)

```
GET /users/{id}/playlists?client_id=<CID>&limit=200&linked_partitioning=1
```

Returns playlist objects directly. Albums are included and flagged `is_album`;
`/users/{id}/playlists_without_albums` and `/users/{id}/albums` exist as the
split variants (both 200 OK, not used).
Implemented: `sc_api::playlists::get_user_playlists`, command `sc_get_playlists`.

**Playlist object — notable fields:** `id`, `title`, `track_count`,
`artwork_url` (often null → we fall back to the first track's art, then the
owner's avatar), `is_album`, `user`, `tracks[]`.

### `GET /playlists/{id}` + `GET /tracks?ids=` — a playlist's tracks ✅ verified (2026-07-27)

```
GET /playlists/{id}?client_id=<CID>&representation=full
GET /tracks?ids=1,2,3&client_id=<CID>
```

⚠️ **Only the first ~5 entries of `tracks[]` are hydrated.** The rest arrive as
stubs — `{ id, kind, policy, monetization_model }` — and must be fetched in
bulk. Measured on a 478-track playlist: 5 full + 473 stubs.

`GET /tracks?ids=` takes a comma-separated list and returns full track objects,
**not necessarily in the requested order**, so we re-sort by the playlist's own
order. We batch 50 ids per request (SoundCloud's web app does the same; larger
batches risk URL-length rejection).

Implemented: `sc_api::playlists::get_playlist_tracks`, command
`sc_get_playlist_tracks`. Covered by the live test
`sc_api::tests::large_playlist_hydrates_every_batch` (478/478 hydrated).

### `GET /users/{id}/followings` — who a user follows ✅ verified (2026-07-27)

```
GET /users/{id}/followings?client_id=<CID>&limit=200&linked_partitioning=1
```

Returns user objects. Public — no login needed.
Implemented: `sc_api::users::get_followings`, command `sc_get_followings`.

### `GET /users/{id}/tracks` — a user's uploads ✅ verified (2026-07-27)

Returns track objects, newest first. Public.
Implemented: `sc_api::users::get_user_tracks`, command `sc_get_user_tracks`.

### Discovery ✅ verified (2026-07-27)

⚠️ **`/charts` is dead** — `GET /charts?kind=top&genre=…` returns **404**. Don't
reach for it; the replacement is `/mixed-selections`, which is what
soundcloud.com renders on its own home page.

```
GET /mixed-selections?client_id=<CID>&limit=6
GET /tracks/{id}/related?client_id=<CID>&limit=30
GET /stations/soundcloud:track-stations:{id}/tracks?client_id=<CID>&limit=50
GET /stations/soundcloud:artist-stations:{user_id}/tracks?client_id=<CID>&limit=50
GET /stream?client_id=<CID>&limit=200&linked_partitioning=1      (OAuth)
GET /me/play-history?client_id=<CID>&limit=200&linked_partitioning=1  (OAuth)
```

| Endpoint | Shape | Notes |
|---|---|---|
| `/mixed-selections` | `{collection: [{id, title, items: {collection: [playlist]}}]}` | Items are `kind: "selection"`; the payload is playlists. Live rows seen: "Trending by genre", "Artists to watch out for", "Curated by SoundCloud". Rows whose payload isn't playlists are dropped. |
| `/tracks/{id}/related` | `{collection: [track], next_href}` | Full track objects. Powers radio and queue-end autoplay. |
| `/stations/…/tracks` | `{collection: [track]}` | **No `next_href`** — one request, not a paginated walk. The station *object* (`/stations/{urn}` without `/tracks`) 404s; only the track list works. Seed urns: `soundcloud:track-stations:{id}`, `soundcloud:artist-stations:{user_id}`. |
| `/stream` | `{collection: [{type, track?, playlist?}], next_href}` | The follow feed. `type` is `track` / `track-repost` / `playlist` / `playlist-repost`; playlist entries are skipped. **OAuth, untested here.** |
| `/me/play-history` | `{collection: [{played_at, track}], next_href}` | Newest first; the same track recurs per play, so results are de-duplicated. **OAuth, untested here.** |

Implemented in `sc_api::discover`; commands `sc_mixed_selections`,
`sc_related_tracks`, `sc_station_tracks`, `sc_stream`, `sc_play_history`.

---

## Beyond SoundCloud

### Lyrics — LRCLIB

SoundCloud serves **no lyrics of any kind**, so this is the only non-SoundCloud
service the app talks to. [LRCLIB](https://lrclib.net) is free and keyless:

```
GET https://lrclib.net/api/get?artist_name=…&track_name=…&duration=<seconds>
GET https://lrclib.net/api/search?q=…
```

Returns `{syncedLyrics, plainLyrics}`; `syncedLyrics` is LRC (`[mm:ss.xx] line`).

SoundCloud titles rarely match a release database, so `lyrics::get` strips
bracketed noise (`(Official Video)`, `[Free DL]`) and a leading `Artist - `
before querying, then falls back from the exact endpoint to fuzzy search. A
miss returns `None` — for remixes, sets and edits that is the normal outcome,
not an error.

### Offline downloads

`sc_api::stream::get_stream_url` → the signed CDN mp3 → `{app_data}/downloads/{id}.mp3`,
tagged with `id3` (title, artist, embedded cover) and indexed in SQLite
(`{app_data}/library.db`, table `downloads`). Playback of a local file goes
through Tauri's asset protocol, which is why `tauri.conf.json` enables
`assetProtocol` for `$APPDATA` and the crate takes the `protocol-asset` feature.

**Quality ceiling: 128 kbps** — that's what the `progressive` transcoding is.

The CDN sends `access-control-allow-origin: *` (verified), which is what makes
the Web Audio equaliser possible: `crossOrigin="anonymous"` plus
`createMediaElementSource` would otherwise yield silence.

---

## Auth model (what needs OAuth vs. not)

- **`client_id` only** (no login): resolve, search, public user likes/tracks/playlists,
  stream URL resolution, playback. — All verified working.
- **OAuth token** (`Authorization: OAuth <token>`): the *logged-in user's* own data and
  actions — `/me`, private tracks, liking/reposting/following, personal feed.

### How we obtain the OAuth token (MVP #4)

No usable public OAuth app exists for us (registration closed since 2015, so a
real `redirect_uri`/browser OAuth flow is impossible). We reuse the web app's
session — the token is the **`oauth_token` cookie** SoundCloud sets after login,
used as `Authorization: OAuth <token>`. Stored in the OS keyring, never logged.
Three ways to capture it, in `src-tauri/src/auth/`:

1. **Browser (primary)** — `sc_login_browser`: open `soundcloud.com/signin` in
   the user's real default browser (where SC's Arkose anti-bot captcha passes
   normally), then read `oauth_token` from the browser's cookie store. Firefox
   family only (`cookies.sqlite`; see `auth/browser.rs`). Opt-in by the user.
2. **Manual token** — `sc_set_token`: user pastes the `oauth_token` copied from
   their browser's DevTools. Validated against `/me` before storing.
3. **Embedded webview** — `sc_login`: opens SC signin in a Tauri webview and
   reads the cookie via `WebviewWindow::cookies()`. **Usually blocked**: SC's
   Arkose captcha flags WebKitGTK as a bot and the challenge is unsolvable in
   the embedded view. Kept as a dormant fallback, not wired into the UI.

Other commands: `sc_logout`, `sc_is_logged_in`, `sc_get_me`.

### `GET /me` — the logged-in user ✅ implemented (needs live login to verify)

```
GET /me?client_id=<CID>        (header: Authorization: OAuth <token>)
```

Returns the full user object. We project `{ id, username, avatar_url,
permalink_url, followers_count }` (`sc_api::me::Me`). A `401`/`403` means the
token is stale → prompt re-login (and `client_id::get(force=true)`).

---

## TODO (to reverse next)

- [x] ~~OAuth token capture (embedded webview + `oauth_token` cookie) + `/me`~~ — done, pending live verification.
- [ ] like/repost/follow actions (need OAuth); handle `401` → refresh flow.
- [x] ~~`/users/{id}/likes` pagination~~ — done (`linked_partitioning=1` + `next_href`).
- [x] ~~Stream URL resolution from a `transcoding.url`~~ — done (see above).
- [ ] HLS manifest handling in the app (`hls.js`) & CDN signing lifetime (URLs expire).
- [ ] Rate limits / when `client_id` gets throttled.
- [x] ~~`/search/users`, `/search/playlists`~~ — done.
- [x] ~~search pagination~~ — done (numeric `offset`).
- [ ] `/search` (all kinds in one response) — untested.
- [ ] reposts (`/stream/users/{id}/reposts`), the personal feed.

---

## Shared shapes

Every endpoint maps SoundCloud's fat objects into three projections that live
in `sc_api::models` (re-exported as `sc_api::{Track, User, Playlist}`) and are
mirrored by the interfaces in `src/lib/tauri.ts`:

| Projection | Fields |
|------------|--------|
| `Track` | `id, title, duration, artwork_url, permalink_url, artist` |
| `User` | `id, username, avatar_url, permalink_url, followers_count, track_count` |
| `Playlist` | `id, title, track_count, artwork_url, permalink_url, owner, is_album` |

Add a field once and every endpoint gets it. Artwork falls back where the API
leaves gaps: a track borrows its uploader's avatar, a playlist borrows its
first track's art and then the owner's avatar.

## Live tests

`src-tauri/src/sc_api/tests.rs` holds `#[ignore]`d tests that hit the real API —
the fastest way to find out whether SoundCloud changed something:

```sh
cd src-tauri && cargo test -- --ignored --nocapture
```

They only touch public data (no login) and are excluded from CI.
