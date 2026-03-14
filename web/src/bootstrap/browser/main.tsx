import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@player-web/compose/App";
import "@player-web/impl/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
