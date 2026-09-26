import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    proxy: {
      "/_kml_images/": {
        target: "https://mymaps.usercontent.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_kml_images\//, "/hostedimage/"),
      },
      "/api": { changeOrigin: false, target: "http://127.0.0.1:3001" },
    },
  },
  preview: {
    proxy: {
      "/api": { changeOrigin: false, target: "http://127.0.0.1:3001" },
    },
  },
  build: {
    chunkSizeWarningLimit: 1_100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("node_modules/maplibre-gl") ? "maplibre" : undefined;
        },
      },
    },
  },
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
        orientation: "portrait",
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
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
