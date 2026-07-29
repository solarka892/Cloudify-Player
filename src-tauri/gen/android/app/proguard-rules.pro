# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Cloudify's own Kotlin ────────────────────────────────────────────────────
#
# None of this is reachable as far as R8 can tell, and all of it is load-bearing:
#
#   - `CloudifyPlugin` is found by name and constructed from Rust
#     (`register_android_plugin`, see src-tauri/src/android/mod.rs), and its
#     `@Command` methods are dispatched reflectively by Tauri's PluginManager.
#     Renaming any of them turns every call into a runtime "no such method".
#   - The `@InvokeArg` classes are populated by Jackson from the JSON field
#     names, so their field names have to survive too.
#   - `LoginActivity` and `PlaybackService` are named as strings in
#     AndroidManifest.xml and reached via Intents.
#
# Getting this wrong shows up only in a release build — a debug APK works fine,
# which is exactly how it would reach a user.
-keep class com.cloudifyplayer.app.CloudifyPlugin { *; }
-keep class com.cloudifyplayer.app.CloudifyPlugin$Companion { *; }
-keep class com.cloudifyplayer.app.LoginActivity { *; }
-keep class com.cloudifyplayer.app.LoginActivity$Result { *; }
-keep class com.cloudifyplayer.app.PlaybackService { *; }
-keep class com.cloudifyplayer.app.PlaybackService$Companion { *; }

-keepclassmembers class com.cloudifyplayer.app.SetSecretArgs { <fields>; }
-keepclassmembers class com.cloudifyplayer.app.KeyArgs { <fields>; }
-keepclassmembers class com.cloudifyplayer.app.PlaybackArgs { <fields>; }

# Tauri's annotations are read at runtime to build the command table.
-keep @interface app.tauri.annotation.**
-keepattributes *Annotation*