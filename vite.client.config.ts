import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The visitor web app (React SPA). Built into dist/web, which the Express server serves;
// in development Vite serves it and forwards /api and /admin to the server.
const serverPort = Number(process.env.PLAYSET_WEB_PORT ?? 3000);

export default defineConfig({
  root: "src/web/client",
  plugins: [react()],
  build: {
    outDir: "../../../dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${serverPort}`,
      "/admin": `http://127.0.0.1:${serverPort}`,
    },
  },
});
