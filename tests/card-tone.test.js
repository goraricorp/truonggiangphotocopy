import { Buffer } from "node:buffer"
import { readFileSync } from "node:fs"
import { PNG } from "pngjs"
import { describe, expect, test } from "vitest"
import {
  cardToneProfile,
  balanceCardTone,
  averageToneProfiles,
} from "../lib/identify/card-tone.js"

function reference(name, back) {
  const image = PNG.sync.read(
    readFileSync(new URL(`../docs/${name}.png`, import.meta.url))
  )
  const [x, y, width, height] =
    name === "new"
      ? back
        ? [3, 304, 500, 297]
        : [3, 3, 500, 295]
      : back
        ? [0, 525, 780, 515]
        : [0, 0, 780, 515]
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++)
    pixels.set(
      image.data.subarray(
        ((y + row) * image.width + x) * 4,
        ((y + row) * image.width + x + width) * 4
      ),
      row * width * 4
    )
  return pixels
}
const distance = (a, b) =>
  a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0)

describe("Cân sáng theo mẫu thẻ, cả hai mặt", () => {
  test.each([
    ["new", false],
    ["new", true],
    ["image", false],
    ["image", true],
  ])("%s mặt sau=%s: giảm sai lệch sáng/tương phản", (name, back) => {
    const pixels = reference(name, back),
      target = cardToneProfile(pixels)
    expect(target).not.toBeNull()
    for (const [gain, offset] of [
      [0.55, 0],
      [0.65, 70],
    ]) {
      const source = Uint8ClampedArray.from(pixels, (value, index) =>
        index % 4 === 3 ? value : value * gain + offset
      )
      const before = distance(cardToneProfile(source), target)
      expect(balanceCardTone(source, target)).toBe(true)
      expect(distance(cardToneProfile(source), target)).toBeLessThan(
        before * 0.35
      )
    }
  })
  test("ảnh đã gần mẫu giữ nguyên mức sáng", () => {
    const pixels = reference("image", false),
      before = pixels.slice()
    balanceCardTone(pixels, cardToneProfile(pixels))
    expect(Buffer.compare(Buffer.from(pixels), Buffer.from(before))).toBe(0)
  })
  test("padding không tham gia đo và luôn trắng, giữ alpha và tỉ lệ màu", () => {
    const pixels = reference("new", false),
      target = cardToneProfile(pixels)
    const mask = new Uint8Array(pixels.length)
    for (let i = 0; i < pixels.length; i += 4) {
      if (i < pixels.length / 2) {
        mask[i] = 255
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
      } else {
        pixels[i] *= 0.6
        pixels[i + 1] *= 0.6
        pixels[i + 2] *= 0.6
      }
    }
    const before = pixels.slice()
    expect(balanceCardTone(pixels, target, mask)).toBe(true)
    let invalid = 0,
      ratioError = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] !== 255) invalid++
      if (mask[i]) {
        if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255)
          invalid++
      } else if (before[i] > 20 && before[i + 1] > 20)
        ratioError = Math.max(
          ratioError,
          Math.abs(pixels[i] / pixels[i + 1] - before[i] / before[i + 1])
        )
    }
    expect(invalid).toBe(0)
    expect(ratioError).toBeLessThan(0.05)
  })
  test("không suy đoán khi không có màu nền hoặc thiếu ảnh mẫu", () => {
    const dark = new Uint8ClampedArray(40000).fill(0)
    expect(balanceCardTone(dark, [100, 160, 210])).toBe(false)
    expect(
      averageToneProfiles([null, [100, 160, 210], [120, 180, 230]])
    ).toEqual([110, 170, 220])
    expect(averageToneProfiles([null])).toBeNull()
  })
})
