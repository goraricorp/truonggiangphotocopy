import { beforeAll, afterAll, describe, test, expect } from "vitest"
import { createRequire } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { PNG } from "pngjs"
import { inspectCardLayout } from "../lib/identify/card-layout.js"
import { detectByLayout } from "../lib/identify/reference-detection.js"
import { detectCard } from "../lib/identify/detection.js"
import { rectifyCard } from "../lib/identify/perspective.js"
import { polygonArea } from "../lib/identify/partial-card.js"
import {
  prepareDocAligner,
  decodeDocAligner,
} from "../lib/identify/doc-aligner-model.js"
const require = createRequire(import.meta.url)
let cv, session, ort
beforeAll(async () => {
  cv = await require("@techstark/opencv-js")
  if (!cv.Mat)
    await new Promise((resolve) => {
      cv.onRuntimeInitialized = resolve
    })
}, 60000)
afterAll(async () => {
  await session?.release()
})
describe("kiểm chứng nhiều đặc trưng bố cục", () => {
  test.each(["front", "back"])(
    "giấy trắng và giấy kẻ ô không phải mặt %s",
    (side) => {
      const image = new cv.Mat(
        404,
        640,
        cv.CV_8UC4,
        new cv.Scalar(235, 232, 220, 255)
      )
      try {
        expect(inspectCardLayout(cv, image, side).accepted).toBe(false)
        for (let x = 0; x < 640; x += 12)
          cv.line(
            image,
            new cv.Point(x, 0),
            new cv.Point(x, 403),
            new cv.Scalar(90, 100, 120, 255),
            1
          )
        for (let y = 0; y < 404; y += 12)
          cv.line(
            image,
            new cv.Point(0, y),
            new cv.Point(639, y),
            new cv.Scalar(90, 100, 120, 255),
            1
          )
        expect(inspectCardLayout(cv, image, side).accepted).toBe(false)
      } finally {
        image.delete()
      }
    }
  )
  test.each(["front", "back"])(
    "khối xanh, một con dấu và các dòng chữ chưa đủ cho mặt %s",
    (side) => {
      const image = new cv.Mat(
        404,
        640,
        cv.CV_8UC4,
        new cv.Scalar(140, 205, 195, 255)
      )
      try {
        cv.circle(
          image,
          new cv.Point(80, 70),
          45,
          new cv.Scalar(200, 40, 30, 255),
          -1
        )
        for (let y = 40; y < 380; y += 35)
          for (let x = 230; x < 590; x += 13)
            cv.rectangle(
              image,
              new cv.Point(x, y),
              new cv.Point(x + 6, y + 8),
              new cv.Scalar(30, 30, 30, 255),
              -1
            )
        expect(inspectCardLayout(cv, image, side).accepted).toBe(false)
      } finally {
        image.delete()
      }
    }
  )
  test("phần thẻ mất hai cạnh không được nhận thành cả thẻ qua bố cục", () => {
    const decoded = PNG.sync.read(
      readFileSync(new URL("../docs/new.png", import.meta.url))
    )
    const image = cv.matFromImageData({
      width: decoded.width,
      height: decoded.height,
      data: new Uint8ClampedArray(decoded.data),
    })
    const region = image.roi(new cv.Rect(115, 3, 312, 295))
    const source = new cv.Mat()
    try {
      cv.resize(region, source, new cv.Size(500, 472))
      const points = [
        { x: 40, y: 101 },
        { x: 494, y: 97 },
        { x: 494, y: 471 },
        { x: 38, y: 471 },
      ]
      expect(
        detectByLayout(
          cv,
          source,
          [{ side: "front" }],
          [{ points, confidence: 0.62 }]
        )
      ).toBeNull()
    } finally {
      source.delete()
      region.delete()
      image.delete()
    }
  })
  test("ảnh nguồn được giữ nguyên khi đo các đặc trưng", () => {
    const image = new cv.Mat(
      404,
      640,
      cv.CV_8UC4,
      new cv.Scalar(140, 205, 195, 255)
    )
    const before = image.data.slice()
    try {
      inspectCardLayout(cv, image, "front")
      expect(Buffer.compare(Buffer.from(image.data), Buffer.from(before))).toBe(
        0
      )
    } finally {
      image.delete()
    }
  })
})
// User photos stay in ignored tmp/, never in source or public assets. This suite
// is skipped on machines without them; the synthetic negative tests always run.
const directory = new URL("../tmp/", import.meta.url)
const cases = [
  { file: "image.png", side: "back", center: [0.53, 0.47], maximumArea: 0.3 },
  {
    file: "image copy.png",
    side: "front",
    center: [0.53, 0.46],
    maximumArea: 0.3,
  },
  {
    file: "image copy 2.png",
    side: "front",
    center: [0.5, 0.43],
    maximumArea: 0.2,
  },
  {
    file: "image copy 3.png",
    side: "back",
    center: [0.62, 0.52],
    maximumArea: 0.25,
  },
]
describe.skipIf(!cases.every((c) => existsSync(new URL(c.file, directory))))(
  "hồi quy bốn ảnh gốc trên giấy trắng/vở",
  () => {
    beforeAll(async () => {
      ort = await import("onnxruntime-web/wasm")
      ort.env.wasm.numThreads = 1
      session = await ort.InferenceSession.create(
        readFileSync(
          new URL(
            "../lib/identify/models/doc-aligner-lcnet.onnx",
            import.meta.url
          )
        )
      )
    }, 60000)
    test.each(cases)(
      "cắt đúng vùng thẻ $side trong $file",
      async ({ file, side, center, maximumArea }) => {
        const png = PNG.sync.read(readFileSync(new URL(file, directory))),
          original = cv.matFromArray(
            png.height,
            png.width,
            cv.CV_8UC4,
            png.data
          ),
          source = new cv.Mat()
        let output, input, result
        try {
          const ratio = Math.min(1, 2400 / Math.max(png.width, png.height))
          cv.resize(
            original,
            source,
            new cv.Size(
              Math.round(png.width * ratio),
              Math.round(png.height * ratio)
            ),
            0,
            0,
            cv.INTER_AREA
          )
          input = new ort.Tensor(
            "float32",
            prepareDocAligner(cv, source),
            [1, 3, 256, 256]
          )
          output = await session.run({ img: input })
          const ai = decodeDocAligner(
            cv,
            output.heatmap,
            source.cols,
            source.rows
          )
          const found = detectByLayout(
            cv,
            source,
            [{ side }],
            [...detectCard(cv, source, { all: true }), ...(ai ? [ai] : [])]
          )
          expect(found?.method).toBe("layout")
          const points = found.points.map((p) => ({
              x: p.x / source.cols,
              y: p.y / source.rows,
            })),
            cx = points.reduce((s, p) => s + p.x / 4, 0),
            cy = points.reduce((s, p) => s + p.y / 4, 0)
          expect(Math.abs(cx - center[0])).toBeLessThan(0.06)
          expect(Math.abs(cy - center[1])).toBeLessThan(0.06)
          expect(polygonArea(points)).toBeLessThan(maximumArea)
          result = rectifyCard(cv, source, found.points)
          expect([result.cols, result.rows]).toEqual([1011, 638])
          expect(inspectCardLayout(cv, result, side).accepted).toBe(true)
        } finally {
          result?.delete()
          input?.dispose()
          if (output) Object.values(output).forEach((t) => t.dispose())
          source.delete()
          original.delete()
        }
      },
      60000
    )
  }
)
