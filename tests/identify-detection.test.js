import {
  partialCardInfo,
  boundedPartialCard,
} from "../lib/identify/partial-card.js"
import { normalizeExposure } from "../lib/identify/exposure.js"
import {
  cardAppearance,
  compareAppearance,
} from "../lib/identify/card-appearance.js"
import {
  detectWithReferences,
  detectFromProposals,
} from "../lib/identify/reference-detection.js"
import { extractFeatures } from "../lib/identify/reference-matching.js"
import { matchReference } from "../lib/identify/reference-matching.js"
import { validCorners } from "../lib/identify/model.js"
import { beforeAll, describe, expect, test } from "vitest"
import { createRequire } from "node:module"
const cvModule = createRequire(import.meta.url)("@techstark/opencv-js")
import { rectifyCard } from "../lib/identify/perspective.js"
import { detectCard } from "../lib/identify/detection.js"

let cv
beforeAll(async () => {
  cv = await cvModule
  if (!cv.Mat)
    await new Promise((resolve) => {
      cv.onRuntimeInitialized = resolve
    })
}, 60000)
function fixture({
  clipped = false,
  lowContrast = false,
  rounded = true,
  empty = false,
  shadow = false,
  blurred = false,
  perspective = false,
  marker = false,
} = {}) {
  const width = 960,
    height = 720
  const bg = lowContrast ? [102, 112, 106] : [104, 56, 27]
  const image = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(...bg, 255))
  if (empty) return { image }
  for (let i = 0; i < 28; i++)
    cv.line(
      image,
      new cv.Point(0, i * 26),
      new cv.Point(width, i * 26 + 3),
      new cv.Scalar(bg[0] + 6, bg[1] + 3, bg[2] + 3, 255),
      2
    )
  const x = clipped ? 0 : 60,
    y = 65,
    w = clipped ? 900 : 840,
    h = Math.round(w / 1.586),
    radius = rounded ? 30 : 0
  const color = new cv.Scalar(
    ...(lowContrast ? [126, 139, 131] : [170, 208, 190]),
    255
  )
  if (radius) {
    cv.rectangle(
      image,
      new cv.Point(x + radius, y),
      new cv.Point(x + w - radius, y + h),
      color,
      -1
    )
    cv.rectangle(
      image,
      new cv.Point(x, y + radius),
      new cv.Point(x + w, y + h - radius),
      color,
      -1
    )
    for (const [px, py] of [
      [x + radius, y + radius],
      [x + w - radius, y + radius],
      [x + w - radius, y + h - radius],
      [x + radius, y + h - radius],
    ])
      cv.circle(image, new cv.Point(px, py), radius, color, -1)
  } else
    cv.rectangle(
      image,
      new cv.Point(x, y),
      new cv.Point(x + w, y + h),
      color,
      -1
    )
  for (let i = 0; i < 13; i++)
    cv.line(
      image,
      new cv.Point(x + 220, y + 50 + i * 31),
      new cv.Point(x + w - 60 - (i % 3) * 20, y + 50 + i * 31),
      new cv.Scalar(45, 70, 70, 255),
      4
    )
  cv.rectangle(
    image,
    new cv.Point(x + 35, y + 135),
    new cv.Point(x + 175, y + 355),
    new cv.Scalar(85, 108, 116, 255),
    -1
  )
  if (marker)
    cv.rectangle(
      image,
      new cv.Point(x + 40, y + 35),
      new cv.Point(x + 120, y + 95),
      new cv.Scalar(240, 25, 35, 255),
      -1
    )
  if (shadow)
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const factor = 0.4 + (0.6 * col) / width
        for (let channel = 0; channel < 3; channel++)
          image.data[(row * width + col) * 4 + channel] *= factor
      }
  if (blurred) cv.GaussianBlur(image, image, new cv.Size(13, 13), 3)
  if (perspective) {
    const region = image.roi(new cv.Rect(x, y, w, h)),
      card = new cv.Mat()
    region.copyTo(card)
    region.delete()
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        w - 1,
        0,
        w - 1,
        h - 1,
        0,
        h - 1,
      ]),
      target =
        perspective === "top"
          ? [245, 110, 720, 130, 915, 625, 50, 650]
          : perspective === "left"
            ? [120, 250, 875, 75, 870, 650, 130, 535]
            : [130, 110, 900, 175, 850, 650, 70, 610],
      to = cv.matFromArray(4, 1, cv.CV_32FC2, target),
      transform = cv.getPerspectiveTransform(from, to)
    try {
      image.setTo(new cv.Scalar(...bg, 255))
      cv.warpPerspective(
        card,
        image,
        transform,
        new cv.Size(width, height),
        cv.INTER_LINEAR,
        cv.BORDER_TRANSPARENT
      )
      return {
        image,
        expected: Array.from({ length: 4 }, (_, i) => ({
          x: target[i * 2],
          y: target[i * 2 + 1],
        })),
      }
    } finally {
      card.delete()
      from.delete()
      to.delete()
      transform.delete()
    }
  }
  return {
    image,
    expected: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  }
}
describe("Nhận diện cạnh bo tròn và cạnh chạm mép", () => {
  test.each([
    { rounded: false },
    { rounded: true },
    { rounded: true, clipped: true },
    { rounded: true, lowContrast: true },
    { rounded: true, lowContrast: true, clipped: true },
    { rounded: true, shadow: true },
    { rounded: true, blurred: true },
    { rounded: true, perspective: true },
    { rounded: true, perspective: "top" },
    { rounded: true, perspective: "left" },
  ])(
    "tìm bốn góc của %j",
    (options) => {
      const { image, expected } = fixture(options)
      try {
        const result = detectCard(cv, image)
        expect(result).not.toBeNull()
        for (let i = 0; i < 4; i++)
          expect(
            Math.hypot(
              result.points[i].x - expected[i].x,
              result.points[i].y - expected[i].y
            )
          ).toBeLessThan(28)
      } finally {
        image.delete()
      }
    },
    30000
  )
  test("không xem nền trống như thẻ", () => {
    const { image } = fixture({ empty: true })
    try {
      expect(detectCard(cv, image)).toBeNull()
    } finally {
      image.delete()
    }
  })
})

// A marker must land at the same place, not merely produce a landscape-sized bitmap.
describe("Nắn phối cảnh và thẻ dọc về ngang", () => {
  test.each(["landscape", "portrait", "perspective"])(
    "giữ góc trên trái và đúng khổ của %s",
    (mode) => {
      const fixtureData = fixture({
        marker: true,
        perspective: mode === "perspective",
      })
      const rotated = new cv.Mat()
      let source = fixtureData.image,
        result
      try {
        if (mode === "portrait") {
          cv.rotate(source, rotated, cv.ROTATE_90_CLOCKWISE)
          source = rotated
        }
        const candidate = detectCard(cv, source)
        expect(candidate).not.toBeNull()
        result = rectifyCard(cv, source, candidate.points)
        expect([result.cols, result.rows]).toEqual([1011, 638])
        const pixel = result.ucharPtr(70, 90)
        expect(pixel[0]).toBeGreaterThan(200)
        expect(pixel[1]).toBeLessThan(70)
        expect(pixel[2]).toBeLessThan(80)
      } finally {
        result?.delete()
        rotated.delete()
        fixtureData.image.delete()
      }
    },
    30000
  )
})

describe("Không nhận nhầm hình cong và quy đổi ảnh lớn", () => {
  test("từ chối hình ellipse không có bốn cạnh thẳng", () => {
    const { image } = fixture({ empty: true })
    try {
      cv.ellipse(
        image,
        new cv.Point(480, 360),
        new cv.Size(390, 245),
        0,
        0,
        360,
        new cv.Scalar(170, 208, 190, 255),
        -1
      )
      expect(detectCard(cv, image)).toBeNull()
    } finally {
      image.delete()
    }
  }, 30000)
  test("đưa góc từ ảnh dò nhỏ về ảnh nguồn lớn", () => {
    const { image, expected } = fixture({ clipped: true }),
      large = new cv.Mat()
    try {
      cv.resize(image, large, new cv.Size(image.cols * 2, image.rows * 2))
      const result = detectCard(cv, large)
      expect(result).not.toBeNull()
      for (let i = 0; i < 4; i++)
        expect(
          Math.hypot(
            result.points[i].x - expected[i].x * 2,
            result.points[i].y - expected[i].y * 2
          )
        ).toBeLessThan(40)
    } finally {
      image.delete()
      large.delete()
    }
  }, 30000)
})

describe("đối chiếu mẫu và phần thẻ ngoài ảnh", () => {
  function patternedReference() {
    const image = new cv.Mat(
      300,
      480,
      cv.CV_8UC4,
      new cv.Scalar(190, 210, 200, 255)
    )
    let seed = 123456
    for (let i = 0; i < 350; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const x = 15 + (seed % 440)
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const y = 15 + (seed % 260)
      cv.rectangle(
        image,
        new cv.Point(x, y),
        new cv.Point(x + 3 + (seed % 10), y + 3 + (seed % 9)),
        new cv.Scalar(seed % 100, 30, 80, 255),
        -1
      )
    }
    return image
  }
  test.each([
    [0.12, 0, "tối"],
    [0.15, 205, "sáng bạc"],
  ])(
    "cân bằng ảnh %s/%s (%s) để tìm lại thẻ",
    (gain, offset) => {
      const reference = patternedReference(),
        source = new cv.Mat(),
        features = extractFeatures(cv, reference)
      let normalized
      try {
        reference.convertTo(source, -1, gain, offset)
        for (let i = 3; i < source.data.length; i += 4) source.data[i] = 255
        const before = source.data.slice()
        normalized = normalizeExposure(cv, source)
        const expected = cardAppearance(reference)
        expect(
          compareAppearance(cardAppearance(normalized), expected).accepted
        ).toBe(true)
        const result = detectWithReferences(cv, source, [
          { id: "mau", image: reference, features, appearance: expected },
        ])
        expect(result?.reference).toBe("mau")
        expect(source.data).toEqual(before)
      } finally {
        normalized?.delete()
        features.delete()
        reference.delete()
        source.delete()
      }
    },
    30000
  )
  test.each([0, 255])(
    "không tạo màu hoặc đặc trưng từ ảnh cháy/mất sáng %s",
    (value) => {
      const source = new cv.Mat(
        150,
        240,
        cv.CV_8UC4,
        new cv.Scalar(value, value, value, 255)
      )
      let normalized
      try {
        normalized = normalizeExposure(cv, source)
        expect(cardAppearance(normalized).cyan).toBe(0)
        expect(normalized.data).toEqual(source.data)
      } finally {
        normalized?.delete()
        source.delete()
      }
    }
  )
  test.each([
    {
      name: "lẹm hai cạnh trái/phải",
      width: 330,
      height: 400,
      points: [
        [-75, 50],
        [404, 50],
        [404, 349],
        [-75, 349],
      ],
    },
    {
      name: "thẻ dọc lẹm nhiều hai đầu",
      width: 280,
      height: 300,
      points: [
        [280, -95],
        [280, 384],
        [-19, 384],
        [-19, -95],
      ],
    },
    {
      name: "thẻ nghiêng mất hai cạnh",
      width: 380,
      height: 300,
      points: [
        [-80, 55],
        [360, -45],
        [440, 275],
        [-20, 350],
      ],
    },
  ])(
    "suy ra khung và bù trắng: $name",
    ({ width, height, points }) => {
      const reference = patternedReference(),
        source = new cv.Mat(),
        from = cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          [0, 0, 479, 0, 479, 299, 0, 299]
        ),
        to = cv.matFromArray(4, 1, cv.CV_32FC2, points.flat()),
        transform = cv.getPerspectiveTransform(from, to)
      let output, maskSource, missing
      try {
        cv.warpPerspective(
          reference,
          source,
          transform,
          new cv.Size(width, height),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(80, 60, 40, 255)
        )
        const result = matchReference(cv, source, reference)
        expect(result).not.toBeNull()
        expect(result.partial.missingFraction).toBeGreaterThan(0.2)
        for (let i = 0; i < 4; i++)
          expect(
            Math.hypot(
              result.points[i].x - points[i][0],
              result.points[i].y - points[i][1]
            )
          ).toBeLessThan(18)
        expect(
          validCorners(
            result.points.map((p) => ({
              x: p.x / (width - 1),
              y: p.y / (height - 1),
            })),
            true
          )
        ).toBe(true)
        output = rectifyCard(cv, source, result.points)
        expect([output.cols, output.rows]).toEqual([1011, 638])
        // A black source mask becomes white exactly where the source is absent.
        maskSource = new cv.Mat(
          height,
          width,
          cv.CV_8UC4,
          new cv.Scalar(0, 0, 0, 255)
        )
        missing = rectifyCard(cv, maskSource, result.points)
        let white = 0,
          present = 0
        for (let i = 0; i < output.data.length; i += 4) {
          if (missing.data[i] === 255) {
            white++
            expect(Array.from(output.data.slice(i, i + 4))).toEqual([
              255, 255, 255, 255,
            ])
          } else present++
        }
        expect(white).toBeGreaterThan(output.cols * output.rows * 0.15)
        expect(present).toBeGreaterThan(output.cols * output.rows * 0.35)
      } finally {
        missing?.delete()
        maskSource?.delete()
        output?.delete()
        transform.delete()
        from.delete()
        to.delete()
        source.delete()
        reference.delete()
      }
    },
    30000
  )
  test("không suy ra toàn bộ thẻ từ một mảnh quá nhỏ", () => {
    const points = [
      { x: -0.6, y: -0.6 },
      { x: 1.6, y: -0.6 },
      { x: 1.6, y: 1.6 },
      { x: -0.6, y: 1.6 },
    ]
    expect(partialCardInfo(points).visibleFraction).toBeLessThan(0.35)
    expect(boundedPartialCard(points)).toBe(false)
    expect(validCorners(points, true)).toBe(false)
  })
  test("màu trắng bù không được coi là phần ảnh còn nhìn thấy", () => {
    const points = [
      { x: -0.5, y: 0 },
      { x: 1.5, y: 0 },
      { x: 1.5, y: 1 },
      { x: -0.5, y: 1 },
    ]
    const info = partialCardInfo(points)
    expect(info.visibleFraction).toBeCloseTo(0.5)
    expect(info.missingFraction).toBeCloseTo(0.5)
    expect(info.padded).toBe(true)
  })
  test("góc AI của ảnh dọc được đối chiếu và đưa về đúng tâm thẻ trên ảnh gốc", () => {
    const reference = patternedReference(),
      source = new cv.Mat(
        800,
        1000,
        cv.CV_8UC4,
        new cv.Scalar(80, 60, 40, 255)
      ),
      rotated = new cv.Mat(),
      features = extractFeatures(cv, reference)
    const roi = source.roi(new cv.Rect(400, 150, 300, 480))
    try {
      cv.rotate(reference, rotated, cv.ROTATE_90_CLOCKWISE)
      rotated.copyTo(roi)
      const result = detectFromProposals(
        cv,
        source,
        [
          {
            id: "mau",
            image: reference,
            features,
            appearance: cardAppearance(reference),
          },
        ],
        [
          {
            points: [
              { x: 400, y: 150 },
              { x: 699, y: 150 },
              { x: 699, y: 629 },
              { x: 400, y: 629 },
            ],
            confidence: 0.8,
            method: "doc-aligner",
          },
        ]
      )
      expect(result?.method).toBe("doc-aligner+reference")
      expect(result.cornerConfidence).toBe(0.8)
      expect(Math.abs(result.points[0].x - 699)).toBeLessThan(8)
      expect(Math.abs(result.points[0].y - 150)).toBeLessThan(8)
      expect(Math.abs(result.points[2].x - 400)).toBeLessThan(8)
      expect(Math.abs(result.points[2].y - 629)).toBeLessThan(8)
    } finally {
      roi.delete()
      features.delete()
      rotated.delete()
      source.delete()
      reference.delete()
    }
  }, 30000)
  test("khung AI tự tin cao vẫn bị từ chối nếu không khớp mẫu", () => {
    const reference = patternedReference(),
      source = new cv.Mat(
        400,
        640,
        cv.CV_8UC4,
        new cv.Scalar(130, 200, 190, 255)
      ),
      features = extractFeatures(cv, reference)
    try {
      expect(
        detectFromProposals(
          cv,
          source,
          [
            {
              id: "mau",
              image: reference,
              features,
              appearance: cardAppearance(reference),
            },
          ],
          [
            {
              points: [
                { x: 0, y: 0 },
                { x: 639, y: 0 },
                { x: 639, y: 399 },
                { x: 0, y: 399 },
              ],
              confidence: 0.99,
              method: "doc-aligner",
            },
          ]
        )
      ).toBeNull()
    } finally {
      features.delete()
      source.delete()
      reference.delete()
    }
  }, 30000)
  test("màu xanh đơn thuần và khung chữ nhật không đủ để xác nhận CCCD", () => {
    const reference = patternedReference(),
      source = new cv.Mat(600, 900, cv.CV_8UC4, new cv.Scalar(80, 60, 40, 255))
    const features = extractFeatures(cv, reference)
    try {
      cv.rectangle(
        source,
        new cv.Point(100, 100),
        new cv.Point(800, 540),
        new cv.Scalar(140, 210, 200, 255),
        -1
      )
      expect(
        detectWithReferences(cv, source, [
          {
            id: "mau",
            image: reference,
            features,
            appearance: cardAppearance(reference),
          },
        ])
      ).toBeNull()
      expect(detectWithReferences(cv, source, [])).toBeNull()
    } finally {
      features.delete()
      reference.delete()
      source.delete()
    }
  }, 30000)
  test("đúng đặc trưng nhưng nền đỏ bị từ chối, không tự nhuộm xanh", () => {
    const reference = patternedReference(),
      source = new cv.Mat()
    reference.copyTo(source)
    const features = extractFeatures(cv, reference)
    try {
      for (let i = 0; i < source.data.length; i += 4) {
        source.data[i] = Math.min(255, source.data[i] + 50)
        source.data[i + 1] = Math.floor(source.data[i + 1] * 0.6)
        source.data[i + 2] = Math.floor(source.data[i + 2] * 0.6)
      }
      const original = source.data.slice()
      expect(
        compareAppearance(cardAppearance(source), cardAppearance(reference))
          .accepted
      ).toBe(false)
      expect(
        detectWithReferences(cv, source, [
          {
            id: "mau",
            image: reference,
            features,
            appearance: cardAppearance(reference),
          },
        ])
      ).toBeNull()
      expect(source.data).toEqual(original)
    } finally {
      features.delete()
      reference.delete()
      source.delete()
    }
  }, 30000)
  test("giữ lại đúng thẻ khớp mẫu nền xanh", () => {
    const reference = patternedReference(),
      source = new cv.Mat(600, 900, cv.CV_8UC4, new cv.Scalar(80, 60, 40, 255)),
      features = extractFeatures(cv, reference)
    const roi = source.roi(new cv.Rect(200, 150, 480, 300))
    try {
      reference.copyTo(roi)
      const result = detectWithReferences(cv, source, [
        {
          id: "mau",
          image: reference,
          features,
          appearance: cardAppearance(reference),
        },
      ])
      expect(result?.reference).toBe("mau")
      expect(Math.abs(result.points[0].x - 200)).toBeLessThan(4)
    } finally {
      roi.delete()
      features.delete()
      reference.delete()
      source.delete()
    }
  }, 30000)
  test("không nạp đặc trưng nằm trong vùng chú thích đã loại", () => {
    const reference = patternedReference(),
      mask = new cv.Mat(
        reference.rows,
        reference.cols,
        cv.CV_8U,
        new cv.Scalar(255)
      )
    let features
    try {
      cv.rectangle(
        mask,
        new cv.Point(0, 0),
        new cv.Point(240, 299),
        new cv.Scalar(0),
        -1
      )
      features = extractFeatures(cv, reference, mask)
      expect(features.keys.size()).toBeGreaterThan(10)
      for (let i = 0; i < features.keys.size(); i++)
        expect(features.keys.get(i).pt.x).toBeGreaterThan(240)
    } finally {
      features?.delete()
      mask.delete()
      reference.delete()
    }
  })
  test.each([false, true])(
    "tìm thẻ nhỏ thay vì vật thể lớn; mất cạnh=%s",
    (clipped) => {
      const reference = patternedReference(),
        source = new cv.Mat(
          800,
          1000,
          cv.CV_8UC4,
          new cv.Scalar(70, 60, 50, 255)
        ),
        small = new cv.Mat()
      const x = clipped ? -30 : 430,
        y = 250,
        width = clipped ? 480 : 240,
        height = clipped ? 300 : 150
      let roi, visible
      try {
        cv.rectangle(
          source,
          new cv.Point(30, 30),
          new cv.Point(950, 740),
          new cv.Scalar(230, 225, 215, 255),
          -1
        )
        cv.resize(reference, small, new cv.Size(width, height))
        const offset = Math.max(0, -x)
        visible = small.roi(new cv.Rect(offset, 0, width - offset, height))
        roi = source.roi(new cv.Rect(Math.max(0, x), y, width - offset, height))
        visible.copyTo(roi)
        const result = matchReference(cv, source, reference)
        expect(result?.method).toBe("reference")
        expect(Math.abs(result.points[0].x - x)).toBeLessThan(6)
        expect(Math.abs(result.points[0].y - y)).toBeLessThan(6)
        expect(Math.abs(result.w - width)).toBeLessThan(10)
      } finally {
        roi?.delete()
        visible?.delete()
        small.delete()
        source.delete()
        reference.delete()
      }
    },
    30000
  )
  test("không đối chiếu được nền trơn không có đặc trưng mẫu", () => {
    const reference = patternedReference(),
      source = new cv.Mat(
        600,
        900,
        cv.CV_8UC4,
        new cv.Scalar(230, 230, 230, 255)
      )
    try {
      expect(matchReference(cv, source, reference)).toBeNull()
    } finally {
      source.delete()
      reference.delete()
    }
  })
  test("chỉ cho phép phần bù có giới hạn khi được yêu cầu", () => {
    const points = [
      { x: -0.1, y: 0.1 },
      { x: 0.8, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: -0.1, y: 0.9 },
    ]
    expect(validCorners(points)).toBe(false)
    expect(validCorners(points, true)).toBe(true)
    expect(
      validCorners(
        points.map((p) => ({ ...p, x: p.x - 1 })),
        true
      )
    ).toBe(false)
  })
  test("phần mất nằm ngoài ảnh được tô trắng, không kéo giãn pixel mép", () => {
    const source = new cv.Mat(
      300,
      480,
      cv.CV_8UC4,
      new cv.Scalar(40, 80, 100, 255)
    )
    let output
    try {
      output = rectifyCard(cv, source, [
        { x: -60, y: 0 },
        { x: 419, y: 0 },
        { x: 419, y: 299 },
        { x: -60, y: 299 },
      ])
      const pixel = (x, y) =>
        Array.from(
          output.data.slice(
            (y * output.cols + x) * 4,
            (y * output.cols + x) * 4 + 4
          )
        )
      expect(pixel(5, 300)).toEqual([255, 255, 255, 255])
      expect(pixel(500, 300)).toEqual([40, 80, 100, 255])
      expect([output.cols, output.rows]).toEqual([1011, 638])
    } finally {
      output?.delete()
      source.delete()
    }
  })
})
