import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@player-web/compose/App";
import { HybridCcV0App } from "@player-web/impl/hybridcc-v0/HybridCcV0App";
import { isHybridCcV0Path } from "@player-web/impl/hybridcc-v0/route";
import { HybridCcV1App } from "@player-web/impl/hybridcc-v1/HybridCcV1App";
import { isHybridCcV1Path } from "@player-web/impl/hybridcc-v1/route";
import "@player-web/impl/styles.css";

const BrowserApp = isHybridCcV1Path(window.location.pathname, import.meta.env.BASE_URL)
  ? HybridCcV1App
  : isHybridCcV0Path(window.location.pathname, import.meta.env.BASE_URL)
    ? HybridCcV0App
    : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserApp />
  </React.StrictMode>,
);
