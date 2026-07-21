import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./macos.css";
import { applyStoredTextSize } from "./data/textSize";
import { I18nProvider } from "./i18n";

const container = document.getElementById("root");
if (!container) throw new Error("#root missing in index.html");

applyStoredTextSize();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
