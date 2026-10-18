import { normalizeExposure } from "./exposure.js"
// Geometric layout cues only: no OCR, face identity or fingerprint recognition.
function region(image, bounds, visit) {
  const pixels = image.data
  const [x0, y0, x1, y1] = bounds.map((v, i) =>
    Math.round(v * (i % 2 ? image.rows : image.cols))
  )
  let count = 0,
    sum = 0,
    squares = 0,
    dark = 0,
    edges = 0,
    red = 0,
    gold = 0,
    cool = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * image.cols + x) * 4,
        r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2],
        light = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
      count++
      sum += light
      squares += light * light
      if (light < 0.42) dark++
      if (r > g * 1.25 && r > b * 1.15 && r > 45) red++
      if (r > b * 1.22 && g > b * 1.12 && r > 55 && g > 40) gold++
      if (g > r * 1.015 && b > r * 0.92 && g > 30) cool++
      if (
        x + 1 < x1 &&
        Math.abs(
          light -
            (pixels[i + 4] * 0.2126 +
              pixels[i + 5] * 0.7152 +
              pixels[i + 6] * 0.0722) /
              255
        ) > 0.07
      )
        edges++
      visit?.(x, y, { r, g, b, light })
    }
  return {
    count,
    mean: sum / Math.max(count, 1),
    variance: squares / Math.max(count, 1) - (sum / Math.max(count, 1)) ** 2,
    dark: dark / Math.max(count, 1),
    edges: edges / Math.max(count, 1),
    red: red / Math.max(count, 1),
    gold: gold / Math.max(count, 1),
    cool: cool / Math.max(count, 1),
  }
}
export function textBands(binary, bounds, minCharacters = 5) {
  const pixels = binary.data
  const [x0, y0, x1, y1] = bounds.map((v, i) =>
      Math.round(v * (i % 2 ? binary.rows : binary.cols))
    ),
    bands = []
  let start = -1
  for (let y = y0; y <= y1; y++) {
    let ink = 0
    if (y < y1)
      for (let x = x0; x < x1; x++) if (pixels[y * binary.cols + x]) ink++
    const active = ink > (x1 - x0) * 0.1 && ink < (x1 - x0) * 0.82
    if (active && start < 0) start = y
    if (!active && start >= 0) {
      const height = y - start
      if (height >= 3 && height <= binary.rows * 0.065) {
        let segments = 0,
          spanStart = -1,
          spanEnd = -1,
          inSegment = false
        for (let x = x0; x < x1; x++) {
          let n = 0
          for (let yy = start; yy < y; yy++)
            if (pixels[yy * binary.cols + x]) n++
          const filled = n >= Math.max(2, height * 0.22)
          if (filled) {
            if (!inSegment) segments++
            if (spanStart < 0) spanStart = x
            spanEnd = x
          }
          inSegment = filled
        }
        if (
          segments >= minCharacters &&
          segments <= 65 &&
          spanEnd - spanStart > (x1 - x0) * 0.4
        )
          bands.push({
            y: start,
            height,
            segments,
            left: spanStart,
            right: spanEnd,
          })
      }
      start = -1
    }
  }
  return bands
}
function chipCue(cv, image, binary) {
  const pixels = binary.data
  const hierarchy = new cv.Mat(),
    contours = new cv.MatVector()
  try {
    cv.findContours(
      binary,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    )
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      try {
        const box = cv.boundingRect(contour),
          area = box.width * box.height
        if (
          box.x / image.cols > 0.37 ||
          box.y / image.rows < 0.27 ||
          box.y / image.rows > 0.72
        )
          continue
        const color = region(image, [
          box.x / image.cols,
          box.y / image.rows,
          (box.x + box.width) / image.cols,
          (box.y + box.height) / image.rows,
        ])
        if (color.gold < 0.35) continue
        if (
          area < image.cols * image.rows * 0.006 ||
          area > image.cols * image.rows * 0.09 ||
          box.width / box.height < 0.65 ||
          box.width / box.height > 1.9 ||
          cv.contourArea(contour) / area < 0.6
        )
          continue
        let rows = 0,
          columns = 0
        for (let y = box.y + 3; y < box.y + box.height - 3; y++) {
          let n = 0
          for (let x = box.x + 2; x < box.x + box.width - 2; x++)
            if (pixels[y * binary.cols + x]) n++
          if (n > box.width * 0.38) rows++
        }
        for (let x = box.x + 3; x < box.x + box.width - 3; x++) {
          let n = 0
          for (let y = box.y + 2; y < box.y + box.height - 2; y++)
            if (pixels[y * binary.cols + x]) n++
          if (n > box.height * 0.3) columns++
        }
        if (rows >= 4 && columns >= 3) return true
      } finally {
        contour.delete()
      }
    }
    return false
  } finally {
    hierarchy.delete()
    contours.delete()
  }
}
function finderCue(cv, gray) {
  const binary = new cv.Mat(),
    hierarchy = new cv.Mat(),
    contours = new cv.MatVector(),
    centers = []
  try {
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
    cv.findContours(
      binary,
      contours,
      hierarchy,
      cv.RETR_TREE,
      cv.CHAIN_APPROX_SIMPLE
    )
    for (let i = 0; i < contours.size(); i++) {
      const child = hierarchy.data32S[i * 4 + 2]
      if (child < 0 || hierarchy.data32S[child * 4 + 2] < 0) continue
      const contour = contours.get(i)
      try {
        const box = cv.boundingRect(contour),
          area = box.width * box.height,
          x = (box.x + box.width / 2) / gray.cols,
          y = (box.y + box.height / 2) / gray.rows
        if (
          x < 0.58 ||
          x > 0.98 ||
          y < 0.02 ||
          y > 0.59 ||
          box.width / box.height < 0.65 ||
          box.width / box.height > 1.5 ||
          area < gray.cols * gray.rows * 0.00012 ||
          area > gray.cols * gray.rows * 0.012
        )
          continue
        const size = Math.sqrt(area)
        if (
          !centers.some(
            (p) =>
              Math.hypot(p.x - x * gray.cols, p.y - y * gray.rows) < size * 0.45
          )
        )
          centers.push({ x: x * gray.cols, y: y * gray.rows, size })
      } finally {
        contour.delete()
      }
    }
    for (const a of centers)
      for (const b of centers)
        for (const c of centers) {
          if (a === b || b === c || a === c) continue
          const u = [b.x - a.x, b.y - a.y],
            v = [c.x - a.x, c.y - a.y],
            lu = Math.hypot(...u),
            lv = Math.hypot(...v)
          if (
            lu < 25 ||
            lv < 25 ||
            lu / lv < 0.55 ||
            lu / lv > 1.8 ||
            Math.abs(u[0] * v[0] + u[1] * v[1]) / lu / lv > 0.35
          )
            continue
          if (
            Math.max(a.size, b.size, c.size) /
              Math.min(a.size, b.size, c.size) >
            2.3
          )
            continue
          return true
        }
    return false
  } finally {
    binary.delete()
    hierarchy.delete()
    contours.delete()
  }
}
export function qrCue(cv, gray) {
  const detector = new cv.QRCodeDetector(),
    points = new cv.Mat()
  try {
    if (!detector.detect(gray, points) || points.data32F.length < 8)
      return finderCue(cv, gray)
    const x =
      (points.data32F[0] +
        points.data32F[2] +
        points.data32F[4] +
        points.data32F[6]) /
      4 /
      gray.cols
    const y =
      (points.data32F[1] +
        points.data32F[3] +
        points.data32F[5] +
        points.data32F[7]) /
      4 /
      gray.rows
    return x > 0.57 && x < 0.97 && y > 0.05 && y < 0.57
  } finally {
    detector.delete()
    points.delete()
  }
}
export function inspectCardLayout(cv, source, side) {
  const resized = new cv.Mat(),
    gray = new cv.Mat(),
    binary = new cv.Mat(),
    rawGray = new cv.Mat(),
    rawBinary = new cv.Mat()
  let image
  try {
    cv.resize(source, resized, new cv.Size(640, 404), 0, 0, cv.INTER_AREA)
    cv.cvtColor(resized, rawGray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(
      rawGray,
      rawBinary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      8
    )
    image = normalizeExposure(cv, resized)
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      8
    )
    const color = region(image, [0.02, 0.02, 0.98, 0.98]),
      cues = {}
    if (side === "front") {
      const emblem = region(image, [0.025, 0.025, 0.3, 0.33]),
        title = region(image, [0.28, 0.1, 0.93, 0.4]),
        portrait = region(image, [0.025, 0.32, 0.3, 0.94])
      cues.emblem = emblem.red > 0.035 && emblem.gold > 0.025
      cues.title = title.red > 0.008
      cues.header =
        Math.max(
          textBands(binary, [0.29, 0.025, 0.94, 0.28], 5).length,
          textBands(rawBinary, [0.29, 0.025, 0.94, 0.28], 5).length
        ) >= 2
      cues.portrait =
        portrait.dark > 0.1 &&
        portrait.variance > 0.012 &&
        portrait.edges > 0.025
      cues.body =
        Math.max(
          textBands(binary, [0.3, 0.35, 0.97, 0.95], 5).length,
          textBands(rawBinary, [0.3, 0.35, 0.97, 0.95], 5).length
        ) >= 3
      return {
        accepted: color.cool > 0.025 && Object.values(cues).every(Boolean),
        score: Object.values(cues).filter(Boolean).length / 5,
        cues,
        metrics: {
          emblem,
          title,
          portrait,
          header: textBands(binary, [0.29, 0.025, 0.94, 0.28], 5),
          body: textBands(binary, [0.3, 0.35, 0.97, 0.95], 5),
        },
        cool: color.cool,
      }
    }
    cues.chip = chipCue(cv, image, binary)
    const bands = textBands(binary, [0.035, 0.65, 0.975, 0.98], 12)
    const rows = bands.filter(
      (b) => b.height >= 7 && b.right - b.left > image.cols * 0.55
    )
    cues.mrz = false
    for (let i = 0; i < rows.length - 2; i++) {
      const [a, b, c] = rows.slice(i, i + 3),
        first = b.y - a.y,
        second = c.y - b.y
      if (
        first > 12 &&
        second > 12 &&
        Math.abs(first - second) < Math.max(first, second) * 0.35 &&
        Math.abs(a.left - c.left) < image.cols * 0.13 &&
        Math.abs(a.right - c.right) < image.cols * 0.13
      )
        cues.mrz = true
    }
    const left = region(image, [0.53, 0.05, 0.74, 0.53]),
      right = region(image, [0.75, 0.05, 0.96, 0.53])
    cues.fingerprints =
      left.dark > 0.12 &&
      right.dark > 0.12 &&
      left.edges > 0.07 &&
      right.edges > 0.07
    cues.qr =
      cues.chip && cues.mrz ? qrCue(cv, gray) || qrCue(cv, rawGray) : false
    cues.stamp = region(image, [0.24, 0.27, 0.56, 0.71]).red > 0.02
    return {
      accepted:
        color.cool > 0.025 &&
        cues.chip &&
        cues.mrz &&
        (cues.qr || cues.fingerprints || cues.stamp),
      score:
        (Number(cues.chip) +
          Number(cues.mrz) +
          Number(cues.qr || cues.fingerprints || cues.stamp)) /
        3,
      cues,
      metrics: { bands, left, right },
      cool: color.cool,
    }
  } finally {
    image?.delete()
    rawGray.delete()
    rawBinary.delete()
    resized.delete()
    gray.delete()
    binary.delete()
  }
}
