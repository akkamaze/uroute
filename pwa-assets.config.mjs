import { defineConfig } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  images: ["apps/mobile/public/uroute-mark.svg"],
  preset: {
    apple: {
      resizeOptions: {
        background: "#1666ff",
        fit: "contain",
      },
      sizes: [180],
    },
    maskable: {
      resizeOptions: {
        background: "#1666ff",
        fit: "contain",
      },
      sizes: [512],
    },
    transparent: {
      favicons: [[48, "favicon.ico"]],
      sizes: [64, 192, 512],
    },
  },
});
