import * as ort from "onnxruntime-web/wasm"
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url"
import runtimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url"
import modelUrl from "./models/doc-aligner-lcnet.onnx?url"
import { boundedPartialCard } from "./partial-card.js"
import {
  prepareDocAligner,
  decodeDocAligner,
  docAlignerViews,
} from "./doc-aligner-model.js"

let session, unavailable
async function loadSession() {
  if (unavailable) throw unavailable
  if (!session) {
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: runtimeUrl }
    session = ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    }).catch((error) => {
      unavailable = error
      throw error
    })
  }
  return session
}
export async function proposeDocAligner(cv, source, mode = "all") {
  const model = await loadSession(),
    proposals = []
  // Overlapping views let a distant card occupy more of the 256px model input.
  const views = docAlignerViews(mode)
  for (const [x, y, w, h] of views) {
    const left = Math.floor(x * source.cols),
      top = Math.floor(y * source.rows),
      width = Math.floor(w * source.cols),
      height = Math.floor(h * source.rows)
    let region
    if (left < 0 || top < 0) {
      region = new cv.Mat(
        height,
        width,
        cv.CV_8UC4,
        new cv.Scalar(255, 255, 255, 255)
      )
      const target = region.roi(
        new cv.Rect(-left, -top, source.cols, source.rows)
      )
      try {
        source.copyTo(target)
      } finally {
        target.delete()
      }
    } else region = source.roi(new cv.Rect(left, top, width, height))
    const input = new ort.Tensor(
      "float32",
      prepareDocAligner(cv, region),
      [1, 3, 256, 256]
    )
    let outputs
    try {
      outputs = await model.run({ img: input })
      const detected = decodeDocAligner(cv, outputs.heatmap, width, height)
      if (!detected) continue
      const result = {
        ...detected,
        points: detected.points.map((p) => ({ x: p.x + left, y: p.y + top })),
      }
      if (
        !boundedPartialCard(
          result.points.map((p) => ({
            x: p.x / (source.cols - 1),
            y: p.y / (source.rows - 1),
          }))
        )
      )
        continue
      if (
        proposals.some((old) =>
          result.points.every(
            (p, i) =>
              Math.hypot(p.x - old.points[i].x, p.y - old.points[i].y) <
              Math.min(width, height) * 0.04
          )
        )
      )
        continue
      proposals.push(result)
    } finally {
      region.delete()
      input.dispose()
      if (outputs) Object.values(outputs).forEach((t) => t.dispose())
    }
  }
  return proposals.sort((a, b) => b.confidence - a.confidence)
}
