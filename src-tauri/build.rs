fn main() {
    // `tauri_build` watches `tauri.conf.json`, but not the per-platform files
    // merged over it. Without these lines editing one changes nothing: cargo
    // sees no reason to rebuild, the previous window configuration stays baked
    // into the binary, and the app comes back up looking exactly as it did —
    // which reads as "the setting does not work" rather than "it was not
    // compiled in".
    //
    // Emitted for all five whether or not they exist, so that *creating* one
    // triggers a rebuild too. Cargo accepts a path that is not there and reruns
    // when it appears.
    for platform in ["macos", "linux", "windows", "android", "ios"] {
        println!("cargo:rerun-if-changed=tauri.{platform}.conf.json");
    }
    tauri_build::build()
}
