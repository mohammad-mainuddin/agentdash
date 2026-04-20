import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_SERVER_URL || "http://server:4242",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
