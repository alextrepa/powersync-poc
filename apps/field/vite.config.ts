import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Canopy Field",
        short_name: "Canopy",
        description: "Offline plant pickup work for field teams",
        theme_color: "#163d31",
        background_color: "#f5f1e6",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/canopy.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/canopy-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/admin(?:\/|$)/,
          /^\/api(?:\/|$)/,
          /^\/powersync(?:\/|$)/,
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: { sourcemap: true },
});
