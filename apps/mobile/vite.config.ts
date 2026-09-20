import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      devOptions: {
        enabled: false,
      },
      includeManifestIcons: false,
      injectRegister: false,
      manifest: {
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            sizes: "192x192",
            src: "/pwa-192x192.png",
            type: "image/png",
          },
          {
            sizes: "512x512",
            src: "/pwa-512x512.png",
            type: "image/png",
          },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "/maskable-icon-512x512.png",
            type: "image/png",
          },
        ],
        id: "/",
        name: "uroute",
        orientation: "any",
        scope: "/",
        short_name: "uroute",
        start_url: "/",
        theme_color: "#ffffff",
      },
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{css,html,ico,js,png,svg,webmanifest}"],
        navigateFallback: "/index.html",
        runtimeCaching: [],
      },
    }),
  ],
});
