// The browser entry: self-hosted fonts, the design tokens, and the app over the real API client.
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createHttpApi } from "./api/index.js";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App api={createHttpApi({ fetch: window.fetch.bind(window) })} />
  </StrictMode>,
);
