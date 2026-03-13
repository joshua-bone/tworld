import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@adapters/react/App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
