// @ts-check

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"
import vercel from "@astrojs/vercel"

// https://astro.build/config
export default defineConfig({
  srcDir: ".",
  prefetch: false,
  adapter: process.env.VERCEL === "1"
    ? vercel({ maxDuration: 180 })
    : node({ mode: "standalone", bodySizeLimit: 16 * 1024 * 1024 }),
  vite: {
    optimizeDeps: {
      include: [
        "react-konva",
        "konva",
        "docx",
        "pdf-lib",
        "@techstark/opencv-js",
        "onnxruntime-web/wasm",
      ],
    },
    plugins: [tailwindcss()],
  },
  integrations: [react()],
})
