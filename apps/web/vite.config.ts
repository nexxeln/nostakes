import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig } from "vite";

const LOCAL_ROOM_SERVER = "http://localhost:1337";

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: false })],
  server: {
    port: 5173,
    proxy: {
      "/rooms": { target: LOCAL_ROOM_SERVER, ws: true },
    },
    strictPort: true,
  },
});
