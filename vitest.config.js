import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
export default defineConfig({
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(
        new URL("./tests/fixtures/astro-env-server.js", import.meta.url)
      ),
    },
  },
})
