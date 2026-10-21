import { inspectCardLayout, qrCue } from "../lib/identify/card-layout.js"
import { detectCard } from "../lib/identify/detection.js"
import { partialCardInfo } from "../lib/identify/partial-card.js"
import { proposeDocAligner, loadSession } from "../lib/identify/doc-aligner.js"
import additionalReferenceUrl from "../docs/image.png?url"
import referenceUrl from "../docs/new.png?url"
import detailReferenceUrl from "../docs/card.png?url"
import { extractFeatures } from "../lib/identify/reference-matching.js"
import { cardAppearance } from "../lib/identify/card-appearance.js"
import {
  detectWithReferences,
  detectByLayout,
} from "../lib/identify/reference-detection.js"
import { rectifyCard } from "../lib/identify/perspective.js"
import cvModule from "@techstark/opencv-js"
import {
  CARD,
  defaults,
  settingsSchema,
  validCorners,
  mmToPx,
} from "../lib/identify/model.js"
import {
  cardToneProfile,
  averageToneProfiles,
  balanceCardTone,
} from "../lib/identify/card-tone.js"
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

let runtime
async function loadCV() {
  if (!runtime)
    runtime = (async () => {
      const cv = await cvModule
      if (cv.Mat) return cv
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Tải OpenCV quá lâu. Hãy thử lại.")),
          45000
        )
        cv.onRuntimeInitialized = () => {
          clearTimeout(timeout)
          resolve()
        }
        cv.onAbort = () => {
          clearTimeout(timeout)
          reject(new Error("Không khởi tạo được OpenCV."))
        }
      })
      return cv
    })()
  return runtime
}
let references
async function loadReferences(cv) {
  if (!references)
    references = (async () => {
      const result = { front: [], back: [] }
      try {
        for (const [url, definitions] of [
          [
            referenceUrl,
            [
              {
                side: "front",
                id: "cccd-primary-front",
                rect: [3, 3, 500, 295],
                exclude: [[12, 100, 126, 160]],
              },
              {
                side: "back",
                id: "cccd-primary-back",
                rect: [3, 304, 500, 297],
                exclude: [[267, 0, 233, 139]],
              },
            ],
          ],
          [
            additionalReferenceUrl,
            [
              {
                side: "front",
                id: "cccd-additional-front",
                rect: [0, 0, 780, 515],
                exclude: [[8, 180, 210, 300]],
              },
              {
                side: "back",
                id: "cccd-additional-back",
                rect: [0, 525, 780, 515],
                exclude: [],
              },
            ],
          ],
          [
            detailReferenceUrl,
            [
              {
                side: "front",
                id: "cccd-detail-front",
                rect: [113, 86, 408, 260],
                exclude: [
                  [6, 84, 110, 147],
                  [49, 65, 26, 90],
                  [59, 134, 349, 24],
                  [87, 181, 321, 24],
                  [252, 73, 156, 22],
                  [382, 0, 26, 260],
                ],
              },
              {
                side: "back",
                id: "cccd-detail-back",
                rect: [113, 369, 408, 260],
                exclude: [
                  [210, 0, 198, 121],
                  [98, 10, 310, 24],
                  [74, 107, 334, 25],
                  [302, 167, 106, 24],
                  [382, 0, 26, 260],
                ],
              },
            ],
          ],
        ]) {
          const response = await fetch(url)
          if (!response.ok) throw new Error("Không tải được ảnh mẫu CCCD.")
          const bitmap = await createImageBitmap(await response.blob())
          try {
            for (const definition of definitions)
              for (const width of [600, 390, 240]) {
                const [x, y, w, h] = definition.rect,
                  height = Math.round((width * h) / w),
                  canvas = new OffscreenCanvas(width, height)
                const context = canvas.getContext("2d")
                context.drawImage(bitmap, x, y, w, h, 0, 0, width, height)
                const image = cv.matFromImageData(
                  context.getImageData(0, 0, width, height)
                )
                const mask = new cv.Mat(
                  height,
                  width,
                  cv.CV_8U,
                  new cv.Scalar(255)
                )
                try {
                  for (const [rx, ry, rw, rh] of definition.exclude)
                    cv.rectangle(
                      mask,
                      new cv.Point(
                        Math.floor((rx / w) * width),
                        Math.floor((ry / h) * height)
                      ),
                      new cv.Point(
                        Math.min(width - 1, Math.ceil(((rx + rw) / w) * width)),
                        Math.min(
                          height - 1,
                          Math.ceil(((ry + rh) / h) * height)
                        )
                      ),
                      new cv.Scalar(0),
                      -1
                    )
                  const features = extractFeatures(cv, image, mask)
                  result[definition.side].push({
                    id: definition.id + "-" + width,
                    side: definition.side,
                    image,
                    features,
                    appearance: cardAppearance(image, mask),
                  })
                } catch (error) {
                  image.delete()
                  throw error
                } finally {
                  mask.delete()
                }
              }
          } finally {
            bitmap.close()
          }
        }
        return result
      } catch (error) {
        Object.values(result)
          .flat()
          .forEach((r) => {
            r.image.delete()
            r.features.delete()
          })
        references = null
        throw error
      }
    })()
  return references
}
// Cache only small exposure profiles; no ORB/AI pass is needed for this step.
let toneReferences
async function loadToneReferences() {
  if (!toneReferences)
    toneReferences = (async () => {
      const result = { front: [], back: [] }
      for (const [url, name, rectangles] of [
        [
          referenceUrl,
          "cccd-primary",
          [
            [3, 3, 500, 295],
            [3, 304, 500, 297],
          ],
        ],
        [
          additionalReferenceUrl,
          "cccd-additional",
          [
            [0, 0, 780, 515],
            [0, 525, 780, 515],
          ],
        ],
      ]) {
        const response = await fetch(url)
        if (!response.ok) throw new Error("Không tải được mẫu cân sáng CCCD.")
        const bitmap = await createImageBitmap(await response.blob())
        try {
          for (const [index, side] of ["front", "back"].entries()) {
            const canvas = new OffscreenCanvas(320, 202),
              context = canvas.getContext("2d")
            context.drawImage(bitmap, ...rectangles[index], 0, 0, 320, 202)
            result[side].push({
              id: `${name}-${side}`,
              profile: cardToneProfile(
                context.getImageData(0, 0, 320, 202).data
              ),
            })
          }
        } finally {
          bitmap.close()
        }
      }
      return result
    })().catch((error) => {
      toneReferences = null
      throw error
    })
  return toneReferences
}
async function process(
  file,
  supplied,
  adjustments,
  side = "front",
  analyzeLayout = false
) {
  const timings = {}
  let stamp = performance.now()
  const stage = (name) => {
    const now = performance.now()
    timings[name] = Math.round(now - stamp)
    stamp = now
  }
  const cv = await loadCV(),
    settings = settingsSchema.parse({ ...defaults, ...adjustments })
  stage("runtime")
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  })
  const original = { width: bitmap.width, height: bitmap.height }
  if (
    original.width < 64 ||
    original.height < 64 ||
    original.width * original.height > 60000000
  ) {
    bitmap.close()
    throw new Error(
      "Ảnh phải có mỗi chiều ít nhất 64px và không vượt quá 60 triệu điểm ảnh."
    )
  }
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale)
    ),
    ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const src = cv.matFromImageData(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    ),
    allocated = [src]
  const mat = () => {
    const m = new cv.Mat()
    allocated.push(m)
    return m
  }
  stage("decode")
  try {
    let detected = null,
      aiError = "",
      aiProposals = 0
    if (!supplied) {
      const sideReferences = [{ side: side === "back" ? "back" : "front" }]
      let proposals = []
      try {
        proposals = await proposeDocAligner(cv, src, "primary")
      } catch {
        aiError =
          "Không chạy được mô hình tìm góc AI; đã dùng đối chiếu mẫu và đường biên."
      }
      stage("ai")
      const candidates = detectCard(cv, src, { all: true })
      detected = detectByLayout(cv, src, sideReferences, [
        ...candidates.slice(0, 24),
        ...proposals,
      ])
      stage("layout")
      if (!detected && !aiError) {
        try {
          const additional = await proposeDocAligner(cv, src, "additional")
          proposals = [...proposals, ...additional].sort(
            (a, b) => b.confidence - a.confidence
          )
          stage("aiExtra")
          detected = detectByLayout(cv, src, sideReferences, additional)
          stage("layoutExtra")
        } catch {
          aiError =
            "Không chạy được lượt AI bổ sung; đã dùng đối chiếu mẫu và đường biên."
        }
      }
      aiProposals = proposals.length
      if (!detected) {
        const reference = (await loadReferences(cv))[sideReferences[0].side]
        stage("references")
        detected = detectWithReferences(cv, src, reference, proposals, {
          skipLayout: true,
        })
      }
    }
    stage("detect")
    if (!supplied && !detected)
      return {
        detected: false,
        timings,
        ai: { available: !aiError, proposals: aiProposals },
        width: canvas.width,
        height: canvas.height,
        original,
        warnings: [
          ...(aiError ? [aiError] : []),
          "Chưa đủ đặc trưng khớp các mẫu CCCD nền xanh. Hãy chụp gần, rõ hơn hoặc mở chỉnh sửa để đặt bốn góc.",
        ],
      }
    const points =
      supplied ??
      detected.points.map((p) => ({
        x: p.x / (src.cols - 1),
        y: p.y / (src.rows - 1),
      }))
    if (!validCorners(points, true))
      throw new Error(
        "Bốn góc không hợp lệ: chọn tuần tự, không để các cạnh giao nhau hoặc suy ra quá nhiều phần nằm ngoài ảnh."
      )
    const p = points.map((p) => ({
      x: p.x * (src.cols - 1),
      y: p.y * (src.rows - 1),
    }))
    const width = mmToPx(CARD.width),
      height = mmToPx(CARD.height)
    const rotated = rectifyCard(cv, src, p, settings.rotation)
    allocated.push(rotated)
    const partial = partialCardInfo(points)
    const padded = partial.padded
    let paddingMask
    if (padded) {
      const maskSource = new cv.Mat(
        src.rows,
        src.cols,
        cv.CV_8UC4,
        new cv.Scalar(0, 0, 0, 255)
      )
      allocated.push(maskSource)
      paddingMask = rectifyCard(cv, maskSource, p, settings.rotation)
      allocated.push(paddingMask)
    }
    const validMask = mat()
    if (paddingMask) {
      cv.cvtColor(paddingMask, validMask, cv.COLOR_RGBA2GRAY)
      cv.threshold(validMask, validMask, 0, 255, cv.THRESH_BINARY_INV)
    }
    const gray = mat(),
      lap = mat(),
      mean = mat(),
      deviation = mat()
    cv.cvtColor(rotated, gray, cv.COLOR_RGBA2GRAY)
    cv.Laplacian(gray, lap, cv.CV_64F)
    cv.meanStdDev(lap, mean, deviation, validMask)
    const warnings = []
    if (aiError) warnings.push(aiError)
    if (detected?.exposureNormalized)
      warnings.push(
        "Đã cân bằng sáng để nhận diện màu và đặc trưng thẻ. Hãy kiểm tra vùng tối hoặc lóa trước khi in."
      )
    if (padded)
      warnings.push(
        `Ước tính ${Math.round(partial.missingFraction * 100)}% khung thẻ nằm ngoài ảnh; đã bù trắng phần thiếu, không khôi phục nội dung đã mất.`
      )
    const longEdge = Math.max(dist(p[0], p[1]), dist(p[1], p[2])) / scale
    if (longEdge < width)
      warnings.push(
        "Ảnh nguồn có độ phân giải thấp hơn mức in 300 DPI; phóng ảnh không bổ sung chi tiết."
      )
    if (deviation.data64F[0] ** 2 < 60)
      warnings.push(
        "Ảnh có thể mờ hoặc ít chi tiết. Hãy kiểm tra chữ và mã QR."
      )
    if (
      points.some(
        (p) => p.x < 0.006 || p.x > 0.994 || p.y < 0.006 || p.y > 0.994
      )
    )
      warnings.push("Góc thẻ sát mép ảnh, có nguy cơ thiếu cạnh.")
    const raw = rotated.data
    let bright = 0,
      sampled = 0
    for (let i = 0; i < raw.length; i += 4) {
      if (paddingMask && paddingMask.data[i] > 0) continue
      sampled++
      if (raw[i] > 248 && raw[i + 1] > 248 && raw[i + 2] > 248) bright++
    }
    if (bright / Math.max(sampled, 1) > 0.18)
      warnings.push(
        "Có nhiều vùng rất sáng; hãy kiểm tra khả năng bị lóa. Đây là cảnh báo theo độ sáng, không phải kết luận OCR."
      )
    if (detected && Math.abs(detected.ratio - CARD.width / CARD.height) > 0.3)
      warnings.push("Phối cảnh mạnh: kiểm tra lại bốn góc trước khi xuất.")
    const balanced = mat()
    rotated.copyTo(balanced)
    let toneMatched = false
    try {
      const samples = (await loadToneReferences())[side]
      const target = averageToneProfiles(
        samples.map((sample) => sample.profile)
      )
      toneMatched = balanceCardTone(balanced.data, target, paddingMask?.data)
    } catch {
      warnings.push(
        "Chưa tải được mẫu cân sáng; giữ ảnh gốc và các điều chỉnh đã chọn."
      )
    }
    const adjusted = mat()
    balanced.convertTo(adjusted, -1, settings.contrast, settings.brightness)
    const smooth = mat()
    cv.GaussianBlur(adjusted, smooth, new cv.Size(0, 0), 1)
    const sharp = mat()
    cv.addWeighted(
      adjusted,
      1 + settings.sharpness,
      smooth,
      -settings.sharpness,
      0,
      sharp
    )
    // Preserve the white outside-source region through brightness and sharpening.
    const sharpPixels = sharp.data,
      paddingPixels = paddingMask?.data
    for (let i = 0; i < sharpPixels.length; i += 4) {
      if (paddingPixels && paddingPixels[i] > 0)
        sharpPixels[i] = sharpPixels[i + 1] = sharpPixels[i + 2] = 255
      sharpPixels[i + 3] = 255
    }
    const output = new OffscreenCanvas(width, height)
    output
      .getContext("2d")
      .putImageData(
        new ImageData(new Uint8ClampedArray(sharpPixels), width, height),
        0,
        0
      )
    const blob = await output.convertToBlob({ type: "image/png" })
    stage("render")
    return {
      timings,
      detected: true,
      method: detected?.method ?? "manual",
      ai: supplied ? null : { available: !aiError, proposals: aiProposals },
      reference: detected?.reference,
      layoutCues: analyzeLayout
        ? {
            ...inspectCardLayout(cv, rotated, side).cues,
            ...(side === "front" ? { qr: qrCue(cv, gray) } : {}),
          }
        : undefined,
      partial,
      toneMatched,
      cornerConfidence: detected?.cornerConfidence,
      blob,
      points,
      settings,
      warnings,
      width: src.cols,
      height: src.rows,
      original,
    }
  } finally {
    allocated.reverse().forEach((m) => m.delete())
  }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "warmup") {
      const cv = await loadCV()
      const results = await Promise.allSettled([
        loadSession(),
        loadReferences(cv),
        loadToneReferences(),
      ])
      self.postMessage({
        id: data.id,
        result: {
          ready: true,
          warnings: results.some((result) => result.status === "rejected")
            ? [
                "Một số tài nguyên chưa tải được; công cụ sẽ dùng các bước xử lý còn khả dụng.",
              ]
            : [],
        },
      })
      return
    }
    self.postMessage({
      id: data.id,
      result: await process(
        data.file,
        data.points,
        data.settings,
        data.side,
        data.analyzeLayout
      ),
    })
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error?.issues
        ? "Thông số chỉnh sửa không hợp lệ."
        : error.message || "Không xử lý được ảnh.",
    })
  }
}
