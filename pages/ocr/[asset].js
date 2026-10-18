import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export const prerender = true
const assets = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
  "vie.traineddata.gz": "@tesseract.js-data/vie/4.0.0/vie.traineddata.gz",
}
for (const name of ["lstm", "simd-lstm", "relaxedsimd-lstm"])
  for (const extension of ["wasm.js", "wasm"])
    assets[`tesseract-core-${name}.${extension}`] =
      `tesseract.js-core/tesseract-core-${name}.${extension}`
export function getStaticPaths() {
  return Object.entries(assets).map(([asset, source]) => ({
    params: { asset },
    props: { source },
  }))
}
export async function GET({ props }) {
  const bytes = await readFile(resolve("node_modules", props.source))
  return new Response(bytes, {
    headers: {
      "Content-Type": props.source.endsWith(".js")
        ? "text/javascript"
        : props.source.endsWith(".wasm")
          ? "application/wasm"
          : "application/gzip",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
