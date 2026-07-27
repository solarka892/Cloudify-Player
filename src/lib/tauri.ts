import { invoke } from "@tauri-apps/api/core";

/**
 * Typed bridge to the Rust backend.
 *
 * The UI must NEVER touch the SoundCloud API or `invoke()` raw command names
 * directly — it goes through these wrappers only (see CLAUDE.md: "Frontend
 * вызывает только методы вроде getUserLikes()"). Add one function per Tauri
 * command; keep names domain-oriented, not endpoint-oriented.
 */

/** App version reported by the Rust core — smoke-tests the JS↔Rust bridge. */
export function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

/**
 * Auto-extract SoundCloud's `client_id` (cached 24h in the backend).
 * The returned value is secret-ish — mask it before showing/logging.
 */
export function getClientId(force = false): Promise<string> {
  return invoke<string>("get_client_id", { force });
}
