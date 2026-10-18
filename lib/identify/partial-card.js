import { identityCropLimits } from "../../utils/constant.js"
export function polygonArea(points) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length]
        return sum + p.x * q.y - p.y * q.x
      }, 0)
    ) / 2
  )
}
function clip(points, axis, bound, keepGreater) {
  const result = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length]
    const inside = (p) => (keepGreater ? p[axis] >= bound : p[axis] <= bound)
    const first = inside(a),
      second = inside(b)
    if (first) result.push(a)
    if (first !== second) {
      const t = (bound - a[axis]) / (b[axis] - a[axis])
      result.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
    }
  }
  return result
}
/** Coordinates normalized to the photograph; corners keep their reference order. */
export function partialCardInfo(points) {
  let visible = points
  for (const [axis, bound, greater] of [
    ["x", 0, true],
    ["x", 1, false],
    ["y", 0, true],
    ["y", 1, false],
  ])
    visible = clip(visible, axis, bound, greater)
  const area = polygonArea(points),
    fraction = area > 0 ? Math.min(1, polygonArea(visible) / area) : 0
  return {
    visibleFraction: fraction,
    missingFraction: 1 - fraction,
    padded: points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1),
  }
}
export function boundedPartialCard(points) {
  const margin = identityCropLimits.outsideMargin
  if (
    points.length !== 4 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x + p.y) ||
        p.x < -margin ||
        p.x > 1 + margin ||
        p.y < -margin ||
        p.y > 1 + margin
    )
  )
    return false
  return (
    partialCardInfo(points).visibleFraction >=
    identityCropLimits.minimumVisibleFraction
  )
}

export function supportsExtrapolation(partial, evidence) {
  return (
    partial.missingFraction <= 0.2 ||
    Boolean(
      evidence &&
      evidence.inliers >= 14 &&
      evidence.ratio >= 0.6 &&
      evidence.coverage >= 0.07
    )
  )
}
