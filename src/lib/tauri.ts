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
