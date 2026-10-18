import { beforeAll, describe, test, expect } from "vitest"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  docAlignerViews,
  prepareDocAligner,
  decodeDocAligner,
} from "../lib/identify/doc-aligner-model.js"
const require = createRequire(import.meta.url)
let cv
beforeAll(async () => {
  cv = await require("@techstark/opencv-js")
  if (!cv.Mat)
    await new Promise((resolve) => {
      cv.onRuntimeInitialized = resolve
    })
}, 60000)
function heatmaps(missing = -1) {
  const size = 64,
    data = new Float32Array(4 * size * size)
  for (const [channel, [x, y]] of [
    [10, 12],
    [54, 12],
    [54, 52],
    [10, 52],
  ].entries()) {
    if (channel === missing) continue
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        data[channel * size * size + (y + dy) * size + x + dx] = Math.exp(
          -(dx * dx + dy * dy) / 8
        )
    // Disconnected weak false corner must not displace the largest component.
    data[channel * size * size + 30 * size + 30] = 0.4
  }
  return { dims: [1, 4, size, size], data }
}
describe("DocAligner ONNX", () => {
  test("nhánh nhanh chạy một góc nhìn và nhánh khó giữ đủ các góc nhìn cũ", () => {
    const primary = docAlignerViews("primary"),
      additional = docAlignerViews("additional")
    expect(primary).toEqual([[0, 0, 1, 1]])
    expect(additional).toHaveLength(6)
    expect([...primary, ...additional]).toEqual(docAlignerViews())
  })

  test("đúng thứ tự BGR, NCHW và chuẩn hóa 0–1 của trọng số gốc", () => {
    const source = new cv.Mat(
      20,
      30,
      cv.CV_8UC4,
      new cv.Scalar(25, 80, 200, 255)
    )
    try {
      const data = prepareDocAligner(cv, source)
      expect(data.length).toBe(3 * 256 * 256)
      expect(data[0]).toBeCloseTo(200 / 255)
      expect(data[256 * 256]).toBeCloseTo(80 / 255)
      expect(data[2 * 256 * 256]).toBeCloseTo(25 / 255)
    } finally {
      source.delete()
    }
  })
  test("centroid vùng góc lớn nhất được quy đổi về kích thước ảnh nguồn", () => {
    const result = decodeDocAligner(cv, heatmaps(), 640, 480)
    expect(result?.points).toHaveLength(4)
    expect(result.points[0].x).toBeCloseTo(104.5, 0)
    expect(result.points[0].y).toBeCloseTo(93.25, 0)
    expect(result.points[2].x).toBeGreaterThan(530)
  })
  test("không suy đoán bốn góc khi thiếu một heatmap hoặc đầu ra sai", () => {
    expect(decodeDocAligner(cv, heatmaps(2), 640, 480)).toBeNull()
    expect(
      decodeDocAligner(
        cv,
        { dims: [1, 3, 64, 64], data: new Float32Array(3 * 64 * 64) },
        640,
        480
      )
    ).toBeNull()
  })
  test("trọng số thật chạy ONNX và từ chối ảnh đen trống", async () => {
    const ort = await import("onnxruntime-web/wasm")
    ort.env.wasm.numThreads = 1
    const model = readFileSync(
      new URL("../lib/identify/models/doc-aligner-lcnet.onnx", import.meta.url)
    )
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../lib/identify/models/doc-aligner-manifest.json",
          import.meta.url
        ),
        "utf8"
      )
    )
    expect(createHash("sha256").update(model).digest("hex")).toBe(
      manifest.sha256
    )
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
    })
    const input = new ort.Tensor(
      "float32",
      new Float32Array(3 * 256 * 256),
      [1, 3, 256, 256]
    )
    let outputs
    try {
      outputs = await session.run({ img: input })
      expect(outputs.heatmap.dims).toEqual([1, 4, 128, 128])
      expect(decodeDocAligner(cv, outputs.heatmap, 640, 480)).toBeNull()
    } finally {
      input.dispose()
      if (outputs) Object.values(outputs).forEach((t) => t.dispose())
      await session.release()
    }
  }, 60000)
})
