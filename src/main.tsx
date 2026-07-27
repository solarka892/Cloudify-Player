import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setLocale } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import "./styles/globals.css";

// Persisted settings rehydrate synchronously, so the stored language is known
// before the first render and no string is ever painted in the wrong one.
setLocale(useSettingsStore.getState().locale);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
