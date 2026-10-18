import { identityCropLimits } from "../../utils/constant.js"
import { boundedPartialCard } from "./partial-card.js"
import { z } from "zod"

export const CARD = { width: 85.6, height: 53.98 }
export const A4 = { width: 210, height: 297 }
export const mmToPx = (mm, dpi = 300) => Math.round((mm * dpi) / 25.4)
export const mmToPt = (mm) => (mm * 72) / 25.4
export const imageDimensionsSchema = z
  .object({ width: z.number().int().min(64), height: z.number().int().min(64) })
  .refine((size) => size.width * size.height <= 60000000)
export const FILE_LIMIT = 20 * 1024 * 1024
export const settingsSchema = z.object({
  brightness: z.number().min(-25).max(25),
  contrast: z.number().min(0.75).max(1.3),
  sharpness: z.number().min(0).max(0.5),
  rotation: z.number().int().min(0).max(3),
})
export const defaults = {
  brightness: 0,
  contrast: 1,
  sharpness: 0.15,
  rotation: 0,
}
export const exportSchema = z.object({
  format: z.enum(["pdf", "docx", "png", "jpeg"]),
  dpi: z.union([z.literal(150), z.literal(300)]),
  gap: z.number().min(0).max(50),
  quality: z.number().min(0.7).max(1),
})
export function validateFile(file) {
  const result = z
    .object({
      type: z.enum(["image/jpeg", "image/png", "image/webp"]),
      size: z.number().positive().max(FILE_LIMIT),
    })
    .safeParse(file)
  if (!result.success)
    throw new Error(
      "Chỉ nhận ảnh JPEG, PNG, WebP, tối đa 20 MB mỗi ảnh. HEIC chưa được hỗ trợ."
    )
}
export function orderCorners(points) {
  const center = points.reduce(
    (sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }),
    { x: 0, y: 0 }
  )
  const sorted = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x)
  )
  const start = sorted.reduce(
    (best, p, i) => (p.x + p.y < sorted[best].x + sorted[best].y ? i : best),
    0
  )
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}
export function validCorners(points, allowPadding = false) {
  if (
    !z
      .array(
        z.object({
          x: z
            .number()
            .min(allowPadding ? -identityCropLimits.outsideMargin : 0)
            .max(allowPadding ? 1 + identityCropLimits.outsideMargin : 1),
          y: z
            .number()
            .min(allowPadding ? -identityCropLimits.outsideMargin : 0)
            .max(allowPadding ? 1 + identityCropLimits.outsideMargin : 1),
        })
      )
      .length(4)
      .safeParse(points).success
  )
    return false
  const crosses = points.map((p, i) => {
    const q = points[(i + 1) % 4],
      r = points[(i + 2) % 4]
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
  })
  const area =
    Math.abs(
      points.reduce(
        (s, p, i) =>
          s + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x,
        0
      )
    ) / 2
  return (
    area > 0.005 &&
    (!allowPadding || boundedPartialCard(points)) &&
    (crosses.every((v) => v > 0.00001) || crosses.every((v) => v < -0.00001))
  )
}
export function pageLayout(gap = 12) {
  const { data, success } = z.number().min(0).max(50).safeParse(gap)
  if (!success) throw new Error("Khoảng cách hai mặt phải từ 0 đến 50 mm.")
  const top = (A4.height - 2 * CARD.height - data) / 2
  return {
    x: (A4.width - CARD.width) / 2,
    top,
    backTop: top + CARD.height + data,
    ...CARD,
  }
}
export function readyCards(cards) {
  const selected = cards.filter((card) => card.included)
  if (!selected.length) throw new Error("Hãy chọn ít nhất một CCCD để xuất.")
  if (
    selected.some(
      (c) =>
        !c.front?.result ||
        !c.back?.result ||
        c.front.status === "processing" ||
        c.back.status === "processing"
    )
  )
    throw new Error(
      "CCCD được chọn còn thiếu mặt hoặc chưa xử lý xong. Hãy bổ sung hoặc bỏ chọn CCCD đó."
    )
  return selected
}
export const fullCorners = () => [
  { x: 0.02, y: 0.02 },
  { x: 0.98, y: 0.02 },
  { x: 0.98, y: 0.98 },
  { x: 0.02, y: 0.98 },
]
