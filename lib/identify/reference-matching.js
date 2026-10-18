import {
  boundedPartialCard,
  partialCardInfo,
  supportsExtrapolation,
} from "./partial-card.js"
import { identityCropLimits } from "../../utils/constant.js"
// Cached features are owned by the caller; temporary features are released per image.
export function extractFeatures(cv, image, mask) {
  const orb = new cv.ORB(),
    gray = new cv.Mat(),
    empty = new cv.Mat()
  const keys = new cv.KeyPointVector(),
    descriptors = new cv.Mat()
  try {
    orb.setMaxFeatures(6500)
    orb.setEdgeThreshold(12)
    orb.setFastThreshold(6)
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY)
    orb.detectAndCompute(gray, mask ?? empty, keys, descriptors)
    return {
      keys,
      descriptors,
      delete() {
        keys.delete()
        descriptors.delete()
      },
    }
  } catch (error) {
    keys.delete()
    descriptors.delete()
    throw error
  } finally {
    orb.delete()
    gray.delete()
    empty.delete()
  }
}
// Match local reference artwork, then reject inconsistent correspondences with RANSAC.
export function matchReference(cv, source, reference, options = {}) {
  const owned = []
  const keep = (value) => {
    owned.push(value)
    return value
  }
  try {
    const sourceFeatures =
      options.sourceFeatures ?? keep(extractFeatures(cv, source))
    const referenceFeatures =
      options.referenceFeatures ??
      keep(extractFeatures(cv, reference, options.mask))
    const { keys, descriptors } = sourceFeatures
    const { keys: refKeys, descriptors: refDescriptors } = referenceFeatures
    if (descriptors.rows < 12 || refDescriptors.rows < 12) return null
    const matcher = keep(new cv.BFMatcher(cv.NORM_HAMMING, false))
    const matches = keep(new cv.DMatchVectorVector())
    matcher.knnMatch(refDescriptors, descriptors, matches, 2)
    const pairs = [],
      used = new Set()
    for (let i = 0; i < matches.size(); i++) {
      const row = matches.get(i)
      try {
        if (row.size() < 2) continue
        const first = row.get(0),
          second = row.get(1)
        if (
          first.distance >= second.distance * 0.75 ||
          used.has(first.trainIdx)
        )
          continue
        used.add(first.trainIdx)
        pairs.push([
          refKeys.get(first.queryIdx).pt,
          keys.get(first.trainIdx).pt,
        ])
      } finally {
        row.delete()
      }
    }
    if (pairs.length < 12) return null
    const from = keep(
      cv.matFromArray(
        pairs.length,
        1,
        cv.CV_32FC2,
        pairs.flatMap(([p]) => [p.x, p.y])
      )
    )
    const to = keep(
      cv.matFromArray(
        pairs.length,
        1,
        cv.CV_32FC2,
        pairs.flatMap(([, p]) => [p.x, p.y])
      )
    )
    const mask = keep(new cv.Mat())
    const homography = keep(cv.findHomography(from, to, cv.RANSAC, 3, mask))
    if (homography.empty()) return null
    const inliers = pairs.filter((_, i) => mask.data[i])
    if (inliers.length < 10 || inliers.length / pairs.length < 0.5) return null
    const xs = inliers.map(([p]) => p.x / reference.cols),
      ys = inliers.map(([p]) => p.y / reference.rows)
    // A logo or a few characters alone cannot establish the full card outline.
    if (
      Math.max(...xs) - Math.min(...xs) < 0.4 ||
      Math.max(...ys) - Math.min(...ys) < 0.35
    )
      return null
    // Wide bounding boxes can still be nearly collinear; require two-dimensional
    // inlier support before extrapolating corners outside the photograph.
    const support = keep(
      cv.matFromArray(
        inliers.length,
        1,
        cv.CV_32FC2,
        inliers.flatMap(([p]) => [p.x, p.y])
      )
    )
    const supportHull = keep(new cv.Mat())
    cv.convexHull(support, supportHull)
    const supportFraction =
      cv.contourArea(supportHull) / reference.cols / reference.rows
    if (supportFraction < identityCropLimits.minimumInlierCoverage) return null
    const matrix = homography.data64F
    const denominators = [
      [0, 0],
      [reference.cols - 1, 0],
      [reference.cols - 1, reference.rows - 1],
      [0, reference.rows - 1],
    ].map(([x, y]) => matrix[6] * x + matrix[7] * y + matrix[8])
    if (
      denominators.some((d) => !Number.isFinite(d) || Math.abs(d) < 1e-7) ||
      !denominators.every((d) => Math.sign(d) === Math.sign(denominators[0]))
    )
      return null
    if (
      Math.max(...denominators.map(Math.abs)) /
        Math.min(...denominators.map(Math.abs)) >
      8
    )
      return null
    const corners = keep(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        reference.cols - 1,
        0,
        reference.cols - 1,
        reference.rows - 1,
        0,
        reference.rows - 1,
      ])
    )
    const projected = keep(new cv.Mat())
    cv.perspectiveTransform(corners, projected, homography)
    const points = Array.from({ length: 4 }, (_, i) => ({
      x: projected.data32F[i * 2],
      y: projected.data32F[i * 2 + 1],
    }))
    const normalized = points.map((p) => ({
      x: p.x / (source.cols - 1),
      y: p.y / (source.rows - 1),
    }))
    if (!boundedPartialCard(normalized)) return null
    const partial = partialCardInfo(normalized)
    // Lost edges demand more consensus, never a guess based on the frame ratio.
    const evidence = {
      inliers: inliers.length,
      ratio: inliers.length / pairs.length,
      coverage: supportFraction,
    }
    if (!supportsExtrapolation(partial, evidence)) return null
    const cross = points.map((p, i) => {
      const q = points[(i + 1) % 4],
        r = points[(i + 2) % 4]
      return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
    })
    if (!cross.every((v) => v > 0)) return null
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    const w =
      (distance(points[0], points[1]) + distance(points[2], points[3])) / 2
    const h =
      (distance(points[0], points[3]) + distance(points[1], points[2])) / 2
    const area =
      Math.abs(
        points.reduce(
          (s, p, i) =>
            s + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x,
          0
        )
      ) / 2
    if (
      w / h < 0.8 ||
      w / h > 2.8 ||
      area / source.cols / source.rows < 0.003 ||
      area / source.cols / source.rows > 3
    )
      return null
    return {
      points,
      w,
      h,
      ratio: w / h,
      score: inliers.length,
      method: "reference",
      partial,
      inlierCoverage: supportFraction,
      evidence,
    }
  } finally {
    owned.reverse().forEach((value) => value.delete())
  }
}
