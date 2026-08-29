import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setLocale } from "@/i18n";
import { isApplePlatform } from "@/lib/platform";
import { useSettingsStore } from "@/stores/useSettingsStore";
import "./styles/globals.css";

// Persisted settings rehydrate synchronously, so the stored language is known
// before the first render and no string is ever painted in the wrong one.
setLocale(useSettingsStore.getState().locale);

// macOS keeps its window frame and floats the three window buttons over the
// top-left of the content — there is no CSS query for "is this a Mac", so the
// answer is written onto the document once and `--titlebar-inset` reads it.
if (isApplePlatform) document.documentElement.dataset.mac = "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
