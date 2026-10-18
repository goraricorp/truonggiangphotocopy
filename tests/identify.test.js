import { describe, expect, test } from "vitest"
import {
  CARD,
  A4,
  mmToPt,
  mmToPx,
  pageLayout,
  fullCorners,
  orderCorners,
  validCorners,
  exportSchema,
  readyCards,
  validateFile,
} from "../lib/identify/model.js"

describe("Khổ thẻ và bố cục in", () => {
  test("khổ cố định theo yêu cầu và A4", () => {
    expect(CARD).toEqual({ width: 85.6, height: 53.98 })
    expect(A4).toEqual({ width: 210, height: 297 })
    expect(mmToPt(25.4)).toBe(72)
    expect(mmToPx(CARD.width)).toBe(1011)
    expect(mmToPx(CARD.height)).toBe(638)
  })
  test.each([0, 12, 50])(
    "hai mặt căn giữa, không tràn với khoảng cách %d mm",
    (gap) => {
      const l = pageLayout(gap)
      expect(l.x * 2 + l.width).toBeCloseTo(210)
      expect(l.backTop - l.top - l.height).toBeCloseTo(gap)
      expect(297 - l.backTop - l.height).toBeCloseTo(l.top)
    }
  )
  test("chặn cấu hình không hợp lệ", () => {
    expect(() => pageLayout(60)).toThrow()
    expect(
      exportSchema.safeParse({ format: "pdf", dpi: 72, gap: 12, quality: 1 })
        .success
    ).toBe(false)
  })
})
describe("Bốn góc", () => {
  test("chấp nhận tứ giác lồi, chặn cạnh giao nhau và vùng quá nhỏ", () => {
    const p = fullCorners()
    expect(validCorners(p)).toBe(true)
    expect(validCorners([p[0], p[2], p[1], p[3]])).toBe(false)
    expect(validCorners(p.map((p) => ({ x: p.x / 100, y: p.y / 100 })))).toBe(
      false
    )
  })
  test("sắp xếp góc theo vòng", () =>
    expect(
      orderCorners([
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]))
})
describe("Dữ liệu đầu vào và xuất nhiều CCCD", () => {
  test("không âm thầm xuất thiếu mặt", () => {
    expect(() =>
      readyCards([
        { included: true, front: { result: new Blob() }, back: null },
      ])
    ).toThrow()
    expect(() =>
      readyCards([
        {
          included: true,
          front: { result: new Blob(), status: "processing" },
          back: { result: new Blob() },
        },
      ])
    ).toThrow()
  })
  test("chỉ loại trừ CCCD theo lựa chọn người dùng và giữ thứ tự", () => {
    const pair = { front: { result: new Blob() }, back: { result: new Blob() } }
    expect(
      readyCards([
        { id: 2, included: true, ...pair },
        { id: 1, included: false },
        { id: 3, included: true, ...pair },
      ]).map((c) => c.id)
    ).toEqual([2, 3])
  })
  test("kiểm tra MIME và dung lượng", () => {
    expect(() => validateFile({ type: "image/heic", size: 100 })).toThrow()
    expect(() =>
      validateFile({ type: "image/png", size: 21 * 1024 * 1024 })
    ).toThrow()
    expect(() => validateFile({ type: "image/png", size: 1000 })).not.toThrow()
  })
})
