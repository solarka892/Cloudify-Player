//! Writes, sent from inside a browser on soundcloud.com's own origin.
//!
//! # Why this exists
//!
//! DataDome guards SoundCloud's write routes and refuses us. Not the token, not
//! the `client_id`, not the headers, and not the cookie — all four were measured
//! and ruled out (`docs/sc-api.md`). What is left is the TLS handshake: the
//! filter fingerprints how a client says hello, rustls does not say it the way a
//! browser does, and nothing we can put in a request changes that.
//!
//! There are three ways out of that and only one of them is not a losing game:
//!
//!   1. wear a browser's TLS fingerprint (`rquest` and friends) — an arms race
//!      against a company whose entire business is winning it;
//!   2. **send the request from a real browser we already have**;
//!   3. hand the write to the user's browser and stop calling this an app.
//!
//! This is (2). The app is drawn by a browser engine; a window of it, pointed at
//! soundcloud.com, has a real browser's handshake because it *is* one. The
//! request goes out from there and the answer comes back.
//!
//! # Why it does not use IPC
//!
//! The obvious way to get the answer back is to let the page call a Tauri
//! command. Tauri will even do it — capabilities have a `remote` field for
//! exactly this. It is also the one thing here worth being careful about: the
//! page is soundcloud.com, and soundcloud.com runs a great deal of other
//! people's advertising code. Handing that a door into the app is a poor trade
//! for saving twenty lines.
//!
//! So nothing is granted. The script leaves its answer on the page and
//! `eval_with_callback` reads it out, which is a one-way street: the app can
//! look into the page, the page cannot reach into the app.
//!
//! # What the user sees
//!
//! Nothing, normally — the window is created hidden and stays that way. When the
//! filter wants a human, the window is shown so there is something to answer,
//! which is the whole reason this approach can work at all: to a *browser*
//! DataDome offers a captcha, where to a Rust client it offers a wall.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::ScApiError;

/// The hidden window's label. One per app, reused for every write.
const LABEL: &str = "sc-write";

/// Where it sits.
///
/// The site's own front page rather than something quieter: this page is what
/// takes us through the filter and earns the cookie the writes then travel
/// with, and a static file on the same host may never be checked at all.
const HOME: &str = "https://soundcloud.com/discover";

/// The same one the sign-in window wears. A window that browses as itself is
/// the single most obvious thing for a filter to pick out.
const BROWSER_UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
                          Chrome/124.0.0.0 Safari/537.36";

/// How long to let the page settle before the first write of a session.
///
/// Only paid once. The window has to have loaded far enough to be on the right
/// origin and to have been handed a cookie; there is no event for "the filter
/// has finished with you", so this is a wait rather than a signal.
const SETTLE: Duration = Duration::from_secs(6);

/// How long a single write may take before we give up on the answer.
const WRITE_TIMEOUT: Duration = Duration::from_secs(20);

/// How often to look for the answer the script leaves behind.
const POLL: Duration = Duration::from_millis(120);

/// What SoundCloud's write routes answer when the filter, not SoundCloud, is
/// the one saying no.
const FILTERED: u16 = 403;

/// How long to leave the challenge on screen before giving up on a human.
///
/// Generous on purpose. Someone who has just been handed a slider to drag may
/// well be doing something else first, and the cost of waiting is a like that
/// takes a while — against the cost of giving up, which is a like that has to be
/// clicked twice for reasons nobody explained.
const HUMAN_TIMEOUT: Duration = Duration::from_secs(180);

/// How often to check whether the challenge has been answered.
const HUMAN_POLL: Duration = Duration::from_millis(700);

/// The running app, so a module with no Tauri types in its signature can still
/// reach a window. Set once at startup; absent in tests and on Android.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Remember the handle. Called from `lib.rs` during setup.
pub fn attach(app: AppHandle) {
    let _ = APP.set(app);
}

/// Distinguishes one write's answer slot from the next. A timed-out write can
/// still land later, and its status must not be read as the following one's.
static NEXT_SLOT: AtomicU64 = AtomicU64::new(0);

/// One write. `body` is sent as the request body.
///
/// Returns SoundCloud's status code — the caller decides what a given number
/// means, exactly as it does for a direct request. With one exception, and it
/// is the point of the whole module: when the filter asks for a human, this
/// waits for one.
pub async fn send(token: &str, method: &str, url: &str, body: &str) -> Result<Outcome, ScApiError> {
    let window = window().await?;

    let answer = attempt(&window, token, method, url, body).await?;
    if answer.status != FILTERED {
        return Ok(answer);
    }

    // The filter wants a human. Show it the window and wait.
    //
    // Doing this here rather than handing a failure upwards is what makes the
    // approach work end to end: a captcha behind an invisible window is a
    // deadlock, and a captcha the user solves after the write has already given
    // up is a heart they have to click twice. The caller's request simply takes
    // as long as the person takes.
    if !await_human(&window).await {
        return Ok(answer);
    }

    let answer = attempt(&window, token, method, url, body).await?;
    if answer.status != FILTERED {
        hide(&window);
    }
    Ok(answer)
}

/// The window, built on first use.
async fn window() -> Result<tauri::WebviewWindow, ScApiError> {
    let app = APP
        .get()
        .ok_or_else(|| ScApiError::Client("no app handle for the write window".into()))?;

    if let Some(existing) = app.get_webview_window(LABEL) {
        return Ok(existing);
    }

    let window = WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::External(
            HOME.parse()
                .map_err(|_| ScApiError::Client("the write window's URL does not parse".into()))?,
        ),
    )
    .title("SoundCloud")
    .inner_size(1024.0, 768.0)
    .visible(false)
    // Never steals the pointer or the keyboard while it is invisible, and does
    // not appear in the task switcher as a window nobody opened.
    .focused(false)
    .skip_taskbar(true)
    .user_agent(BROWSER_UA)
    .build()
    .map_err(|e| ScApiError::Client(format!("write window: {e}")))?;

    // A window we just built has not loaded anything yet, so the write behind it
    // waits. Keyed on having built it rather than on a "first time this session"
    // flag: this is a real window, it appears in the taskbar the moment it is
    // shown, and the user can close it — the one built to replace it needs the
    // same wait the first one got.
    tokio::time::sleep(SETTLE).await;

    Ok(window)
}

/// What came back.
///
/// More than the status, and the reason is a scare worth not repeating: the
/// heart in the UI flips before the write lands and only rolls back if the write
/// *reports* a failure, so a number this module misreads as success is a like
/// that never happened and never said so. `redirected` is the case that would do
/// it — `fetch` follows redirects by default, so a write bounced to a sign-in
/// page arrives here as a cheerful `200` from somewhere else entirely. And
/// `body` is what SoundCloud said, for whenever the number alone is not enough.
#[derive(Debug)]
pub struct Outcome {
    pub status: u16,
    pub redirected: bool,
    pub body: String,
}

/// Run the request in the page and wait for its answer.
async fn attempt(
    window: &tauri::WebviewWindow,
    token: &str,
    method: &str,
    url: &str,
    body: &str,
) -> Result<Outcome, ScApiError> {
    let slot = format!(
        "__cloudifyWrite{}",
        NEXT_SLOT.fetch_add(1, Ordering::Relaxed)
    );
    window
        .eval(script(&slot, token, method, url, body))
        .map_err(|e| ScApiError::Client(format!("write window eval: {e}")))?;

    // One sink for the whole wait, not one per look.
    //
    // The callback fires on the webview's thread some time after the ask, which
    // is always later than the same iteration's read. Handing each look its own
    // sink meant every answer landed in a box that had already been thrown away,
    // and the write timed out no matter what SoundCloud said. Shared, an answer
    // asked for on one pass is simply found on the next.
    let sink: Answer = Arc::new(Mutex::new(None));

    let deadline = Instant::now() + WRITE_TIMEOUT;
    loop {
        ask(window, &slot, sink.clone())?;
        tokio::time::sleep(POLL).await;

        if let Some(answer) = take(&sink) {
            // A status of zero is the script's own way of saying the request
            // never completed — a dropped connection, a refused preflight.
            // There is nothing to report, so it is reported as that.
            if answer.status == 0 {
                return Err(ScApiError::Client(
                    "the write never reached SoundCloud".into(),
                ));
            }
            return Ok(answer);
        }
        if Instant::now() >= deadline {
            return Err(ScApiError::Client("the write window did not answer".into()));
        }
    }
}

/// Show the window, wait for the challenge to be answered, hide it again.
///
/// "Answered" is read off the cookie rather than off the page. The filter hands
/// out a new `datadome` cookie the moment it is satisfied, which is the one
/// signal that means exactly what we need it to mean — where the page's own
/// markup is somebody else's private business, changes without warning, and
/// would have us guessing from the shape of a `<div>`.
///
/// The alternative, retrying the write on a timer until it stops being refused,
/// would work too and is worse: it means firing dozens of writes at a service
/// that has just told us it thinks we are a robot.
///
/// Returns whether the human turned up.
async fn await_human(window: &tauri::WebviewWindow) -> bool {
    let before = datadome_cookie(window);

    let _ = window.set_skip_taskbar(false);
    let _ = window.show();
    let _ = window.set_focus();

    let deadline = Instant::now() + HUMAN_TIMEOUT;
    while Instant::now() < deadline {
        tokio::time::sleep(HUMAN_POLL).await;
        // Closing the window is an answer too — "not now". Waiting out three
        // minutes on a window that no longer exists helps nobody.
        if window.is_visible().is_err() {
            return false;
        }
        let now = datadome_cookie(window);
        // A cookie that has changed — or arrived where there was none — is the
        // filter saying it is satisfied.
        if now.is_some() && now != before {
            hide(window);
            return true;
        }
    }
    // Left on screen deliberately. Whoever walked away from it can still come
    // back and answer, and the next write will go straight through.
    false
}

/// The window's current `datadome` cookie, if it has one.
fn datadome_cookie(window: &tauri::WebviewWindow) -> Option<String> {
    let cookies = window.cookies().ok()?;
    cookies
        .iter()
        .find(|c| c.name() == "datadome")
        .map(|c| c.value().to_string())
}

/// Put it away again.
fn hide(window: &tauri::WebviewWindow) {
    let _ = window.hide();
    let _ = window.set_skip_taskbar(true);
}

/// Where the webview leaves what it was asked for.
type Answer = Arc<Mutex<Option<String>>>;

/// Ask the page for the slot's value. The answer arrives in `sink`, later.
fn ask(window: &tauri::WebviewWindow, slot: &str, sink: Answer) -> Result<(), ScApiError> {
    window
        .eval_with_callback(
            format!("(window.{slot} === undefined ? 'pending' : window.{slot})"),
            move |value| {
                *sink.lock().expect("write answer poisoned") = Some(value);
            },
        )
        .map_err(|e| ScApiError::Client(format!("write window read: {e}")))
}

/// The answer, if one has arrived. Consumes it either way, so a `pending` from
/// an earlier look cannot be mistaken for the answer to a later one.
fn take(sink: &Answer) -> Option<Outcome> {
    let value = sink.lock().expect("write answer poisoned").take()?;
    // Comes back JSON-encoded — the page's own string arrives as a quoted JSON
    // string, so it is unwrapped once before being read as the object it is.
    let raw: String = serde_json::from_str(value.trim()).ok()?;
    if raw == "pending" {
        return None;
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    Some(Outcome {
        status: parsed.get("s").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
        redirected: parsed
            .get("r")
            .and_then(|v| v.as_bool())
            .unwrap_or_default(),
        body: parsed
            .get("b")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

/// The script that does the request and leaves its status on the page.
///
/// Deliberately small and deliberately quiet: one global, holding a number, and
/// everything else closed over inside the function.
///
/// The token goes into the page. That is the part worth saying out loud: this is
/// SoundCloud's own credential on SoundCloud's own site, sent in the header
/// SoundCloud's own app sends it in, but it does sit in a script on a page that
/// also runs advertising code. It is held in a closure rather than on `window`,
/// which is the difference between "another script would have to be looking for
/// it" and "another script can read it".
///
/// It cannot come from `document.cookie` instead: this window has never signed
/// in, and the cookie is `HttpOnly` in a window that has.
///
/// `credentials: "include"` is the reason for doing any of this here. It sends
/// the cookies this window earned by loading the site — which is what the filter
/// wants to see, and what a request built in Rust can never have.
fn script(slot: &str, token: &str, method: &str, url: &str, body: &str) -> String {
    let url = json_string(url);
    let method = json_string(method);
    let body = json_string(body);
    let auth = json_string(&format!("OAuth {token}"));
    format!(
        r#"(function () {{
  window.{slot} = undefined;
  fetch({url}, {{
    method: {method},
    headers: {{ "Content-Type": "application/json", "Authorization": {auth} }},
    body: {body},
    credentials: "include",
    mode: "cors",
  }})
    .then(function (r) {{
      return r.text().catch(function () {{ return ""; }}).then(function (t) {{
        window.{slot} = JSON.stringify({{
          s: r.status,
          r: r.redirected,
          b: String(t).slice(0, 200),
        }});
      }});
    }})
    .catch(function () {{ window.{slot} = JSON.stringify({{ s: 0, r: false, b: "" }}); }});
}})();"#
    )
}

/// Quote a value for embedding in the script. Not a general JSON encoder — it
/// only has to survive the URLs and one-object bodies these routes send.
fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into())
}
