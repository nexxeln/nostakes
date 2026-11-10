import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig } from "vite";

const roomServer = process.env.ROOM_SERVER_URL ?? "http://localhost:1337";

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: false })],
  server: {
    port: 5173,
    proxy: {
      "/rooms": { target: roomServer, ws: true },
    },
    strictPort: true,
  },
});
