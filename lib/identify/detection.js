import { CARD, orderCorners } from "./model.js"

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const polygonArea = (points) =>
  Math.abs(
    points.reduce(
      (sum, p, i) =>
        sum + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x,
      0
    )
  ) / 2
function intersection(a, b) {
  const cross = a.vx * b.vy - a.vy * b.vx
  if (Math.abs(cross) < 0.1) return null
  const t = ((b.x - a.x) * b.vy - (b.y - a.y) * b.vx) / cross
  return { x: a.x + t * a.vx, y: a.y + t * a.vy }
}
// Recover tangent intersections rather than cropping off rounded corners.
function refineCorners(cv, points, contour) {
  const tolerance = Math.max(
    2,
    Math.min(...points.map((p, i) => distance(p, points[(i + 1) % 4]))) * 0.07
  )
  const lines = []
  for (let i = 0; i < 4; i++) {
    const a = points[i],
      b = points[(i + 1) % 4],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy),
      samples = []
    let min = 1,
      max = 0
    for (let j = 0; j < contour.rows; j++) {
      const x = contour.data32S[j * 2],
        y = contour.data32S[j * 2 + 1],
        t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len),
        d = Math.abs(dx * (y - a.y) - dy * (x - a.x)) / len
      if (t > 0.12 && t < 0.88 && d < tolerance) {
        samples.push(x, y)
        min = Math.min(min, t)
        max = Math.max(max, t)
      }
    }
    if (samples.length / 2 < Math.max(8, len * 0.22) || max - min < 0.45)
      return null
    const input = cv.matFromArray(samples.length / 2, 1, cv.CV_32FC2, samples),
      line = new cv.Mat()
    try {
      cv.fitLine(input, line, cv.DIST_HUBER, 0, 0.01, 0.01)
      lines.push({
        vx: line.data32F[0],
        vy: line.data32F[1],
        x: line.data32F[2],
        y: line.data32F[3],
      })
    } finally {
      input.delete()
      line.delete()
    }
  }
  const refined = lines.map((line, i) => intersection(lines[(i + 3) % 4], line))
  if (refined.some((p, i) => !p || distance(p, points[i]) > tolerance * 4))
    return null
  return refined
}
export function detectCard(cv, source, options = {}) {
  const allocated = [],
    candidates = []
  const mat = () => {
    const m = new cv.Mat()
    allocated.push(m)
    return m
  }
  const image = mat(),
    gray = mat(),
    blur = mat(),
    mask = mat(),
    closed = mat(),
    hierarchy = mat()
  const scale = Math.min(1, 1200 / Math.max(source.cols, source.rows))
  try {
    cv.resize(
      source,
      image,
      new cv.Size(
        Math.round(source.cols * scale),
        Math.round(source.rows * scale)
      ),
      0,
      0,
      cv.INTER_AREA
    )
    const width = image.cols,
      height = image.rows,
      total = width * height
    const kernelSize = Math.max(
        3,
        Math.round(Math.min(width, height) * 0.012) | 1
      ),
      kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U)
    allocated.push(kernel)
    const collect = (binary, method) => {
      cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel)
      const contours = new cv.MatVector()
      try {
        cv.findContours(
          closed,
          contours,
          hierarchy,
          cv.RETR_LIST,
          cv.CHAIN_APPROX_NONE
        )
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i),
            hull = new cv.Mat(),
            approx = new cv.Mat()
          try {
            const contourArea = Math.abs(cv.contourArea(contour))
            if (contourArea / total < 0.007 || contourArea / total > 0.985)
              continue
            cv.convexHull(contour, hull, false, true)
            const hullArea = Math.abs(cv.contourArea(hull)),
              perimeter = cv.arcLength(hull, true)
            if (contourArea / hullArea < 0.7) continue
            for (const epsilon of [0.012, 0.022, 0.035, 0.05]) {
              cv.approxPolyDP(hull, approx, epsilon * perimeter, true)
              if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
              let p = orderCorners(
                Array.from({ length: 4 }, (_, j) => ({
                  x: approx.data32S[j * 2],
                  y: approx.data32S[j * 2 + 1],
                }))
              )
              const refined = refineCorners(cv, p, contour)
              if (!refined && method !== "scan" && !options.all) continue
              p = refined ?? p
              if (
                p.some(
                  (p) =>
                    p.x < -3 || p.x > width + 2 || p.y < -3 || p.y > height + 2
                )
              )
                continue
              p = p.map((p) => ({
                x: Math.max(0, Math.min(width - 1, p.x)),
                y: Math.max(0, Math.min(height - 1, p.y)),
              }))
              const area = polygonArea(p),
                coverage = area / total,
                fill = hullArea / area
              if (
                coverage < 0.007 ||
                coverage > 0.985 ||
                fill < 0.82 ||
                fill > 1.13
              )
                continue
              // A threshold of the entire background must not become a successful crop.
              const frameEdges = p.filter((a, j) => {
                const b = p[(j + 1) % 4]
                return (
                  (a.x < 2 && b.x < 2) ||
                  (a.x > width - 3 && b.x > width - 3) ||
                  (a.y < 2 && b.y < 2) ||
                  (a.y > height - 3 && b.y > height - 3)
                )
              }).length
              if (frameEdges >= 3) continue
              let w = (distance(p[0], p[1]) + distance(p[2], p[3])) / 2,
                h = (distance(p[0], p[3]) + distance(p[1], p[2])) / 2
              if (w < h) {
                p = [p[1], p[2], p[3], p[0]]
                ;[w, h] = [h, w]
              }
              const ratio = w / h
              if (ratio < 1.15 || ratio > 2.25) continue
              const ratioFit = Math.max(
                0,
                1 -
                  Math.abs(Math.log(ratio / (CARD.width / CARD.height))) / 0.55
              )
              const score =
                coverage * 0.5 + ratioFit * 0.35 + Math.min(fill, 1) * 0.15
              candidates.push({
                points: p.map((p) => ({ x: p.x / scale, y: p.y / scale })),
                w: w / scale,
                h: h / scale,
                ratio,
                score,
                method,
              })
              break
            }
          } finally {
            contour.delete()
            hull.delete()
            approx.delete()
          }
        }
      } finally {
        contours.delete()
      }
    }
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    for (const threshold of [14, 30, 60, 100]) {
      cv.Canny(blur, mask, threshold, threshold * 2.5)
      collect(mask, "edges")
    }
    // jscanify-style edge -> blur -> Otsu candidate, still reference-verified.
    cv.Canny(gray, mask, 50, 200)
    cv.GaussianBlur(mask, mask, new cv.Size(3, 3), 0)
    cv.threshold(mask, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    collect(mask, "scan")
    const segment = (plane, method) => {
      for (const type of [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]) {
        cv.threshold(plane, mask, 0, 255, type + cv.THRESH_OTSU)
        collect(mask, method)
      }
    }
    segment(blur, "brightness")
    const rgb = mat(),
      color = mat(),
      plane = mat()
    cv.cvtColor(image, rgb, cv.COLOR_RGBA2RGB)
    const extractChannel = (index) => {
      const channels = new cv.MatVector()
      try {
        cv.split(color, channels)
        const channel = channels.get(index)
        try {
          channel.copyTo(plane)
        } finally {
          channel.delete()
        }
      } finally {
        channels.delete()
      }
    }
    cv.cvtColor(rgb, color, cv.COLOR_RGB2Lab)
    for (const channel of [1, 2]) {
      extractChannel(channel)
      cv.GaussianBlur(plane, plane, new cv.Size(5, 5), 0)
      segment(plane, "color")
    }
    cv.cvtColor(rgb, color, cv.COLOR_RGB2HSV)
    extractChannel(1)
    segment(plane, "saturation")
    const lower = new cv.Mat(
        color.rows,
        color.cols,
        color.type(),
        new cv.Scalar(70, 12, 25)
      ),
      upper = new cv.Mat(
        color.rows,
        color.cols,
        color.type(),
        new cv.Scalar(113, 255, 255)
      )
    allocated.push(lower, upper)
    cv.inRange(color, lower, upper, mask)
    collect(mask, "cyan")
    candidates.sort((a, b) => b.score - a.score)
    if (!options.all) return candidates[0] ?? null
    // Keep distinct regions so a large notebook cannot hide a smaller card.
    const distinct = []
    for (const candidate of candidates) {
      if (
        distinct.some((old) =>
          candidate.points.every(
            (p, i) =>
              distance(p, old.points[i]) <
              Math.max(candidate.w, candidate.h) * 0.06
          )
        )
      )
        continue
      distinct.push(candidate)
    }
    return distinct
  } finally {
    allocated.reverse().forEach((m) => m.delete())
  }
}
