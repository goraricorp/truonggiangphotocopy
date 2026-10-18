import { inspectCardLayout } from "./card-layout.js"
import { partialCardInfo, supportsExtrapolation } from "./partial-card.js"
import { normalizeExposure } from "./exposure.js"
import { extractFeatures, matchReference } from "./reference-matching.js"
import { cardAppearance, compareAppearance } from "./card-appearance.js"
import { detectCard } from "./detection.js"
import { rectifyCard, landscapeCorners } from "./perspective.js"
import { CARD, validCorners } from "./model.js"

function verify(cv, source, result, reference) {
  if (
    !result ||
    !validCorners(
      result.points.map((p) => ({
        x: p.x / (source.cols - 1),
        y: p.y / (source.rows - 1),
      })),
      true
    )
  )
    return null
  const partial = partialCardInfo(
    result.points.map((p) => ({
      x: p.x / (source.cols - 1),
      y: p.y / (source.rows - 1),
    }))
  )
  if (!supportsExtrapolation(partial, result.evidence)) return null
  const crop = rectifyCard(cv, source, result.points)
  try {
    const appearance = compareAppearance(
      cardAppearance(crop),
      reference.appearance
    )
    return appearance.accepted
      ? {
          ...result,
          score: result.score * appearance.score,
          reference: reference.id,
        }
      : null
  } finally {
    crop.delete()
  }
}
function search(cv, source, references) {
  const features = extractFeatures(cv, source),
    results = []
  try {
    for (const reference of references) {
      const result = matchReference(cv, source, reference.image, {
        sourceFeatures: features,
        referenceFeatures: reference.features,
      })
      const verified = verify(cv, source, result, reference)
      if (verified) results.push(verified)
    }
    return results.sort((a, b) => b.score - a.score)[0] ?? null
  } finally {
    features.delete()
  }
}
export function detectFromProposals(cv, source, references, proposals) {
  for (const candidate of proposals) {
    const crop = rectifyCard(cv, source, candidate.points),
      small = new cv.Mat()
    let from, to, transform, input, output
    try {
      cv.resize(crop, small, new cv.Size(600, 378), 0, 0, cv.INTER_AREA)
      const match = search(cv, small, references)
      if (!match) continue
      from = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [0, 0, 599, 0, 599, 377, 0, 377]
      )
      to = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        landscapeCorners(candidate.points).flatMap((p) => [p.x, p.y])
      )
      transform = cv.getPerspectiveTransform(from, to)
      input = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        match.points.flatMap((p) => [p.x, p.y])
      )
      output = new cv.Mat()
      cv.perspectiveTransform(input, output, transform)
      const result = {
        ...match,
        points: Array.from({ length: 4 }, (_, i) => ({
          x: output.data32F[i * 2],
          y: output.data32F[i * 2 + 1],
        })),
      }
      const ref = references.find((r) => r.id === match.reference)
      const verified = verify(cv, source, result, ref)
      if (verified)
        return {
          ...verified,
          method:
            candidate.method === "doc-aligner"
              ? "doc-aligner+reference"
              : "contour+reference",
          cornerConfidence: candidate.confidence,
        }
    } finally {
      crop.delete()
      small.delete()
      from?.delete()
      to?.delete()
      transform?.delete()
      input?.delete()
      output?.delete()
    }
  }
  return null
}

function detectNormalized(cv, source, references, proposals) {
  const direct = search(cv, source, references)
  if (direct) return direct
  const proposed = detectFromProposals(cv, source, references, proposals)
  if (proposed) return proposed
  return detectFromProposals(
    cv,
    source,
    references,
    detectCard(cv, source, { all: true }).slice(0, 10)
  )
}

export function detectByLayout(cv, source, references, proposals) {
  const side = references[0]?.side
  if (!side) return null
  const found = []
  const priority = (candidate) => candidate.confidence ?? candidate.score ?? 0
  const orderedProposals = [...proposals].sort(
    (a, b) => priority(b) - priority(a)
  )
  for (const candidate of orderedProposals) {
    const normalized = candidate.points.map((p) => ({
      x: p.x / (source.cols - 1),
      y: p.y / (source.rows - 1),
    }))
    if (!validCorners(normalized) || partialCardInfo(normalized).padded)
      continue
    const corners = landscapeCorners(candidate.points)
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    const aspect =
      (distance(corners[0], corners[1]) + distance(corners[2], corners[3])) /
      (distance(corners[1], corners[2]) + distance(corners[3], corners[0]))
    // Layout alone cannot distinguish a cropped fragment from a strongly
    // foreshortened card. Require reference evidence for either case.
    const relativeAspect = aspect / (CARD.width / CARD.height)
    if (relativeAspect < 0.82 || relativeAspect > 1.25) continue
    for (const offset of [0, 2]) {
      const ordered = [...corners.slice(offset), ...corners.slice(0, offset)]
      const crop = rectifyCard(cv, source, ordered)
      try {
        const layout = inspectCardLayout(cv, crop, side)
        if (!layout.accepted) continue
        const accepted = {
          points: ordered,
          method: "layout",
          reference: `cccd-layout-${side}`,
          layout,
          score:
            layout.score + (candidate.confidence ?? candidate.score ?? 0) * 0.1,
          cornerConfidence: candidate.confidence,
        }
        // Every later candidate has no higher priority, and layout score is
        // bounded by 1. Stop only when no later candidate can improve the score.
        if (layout.score === 1) return accepted
        found.push(accepted)
      } finally {
        crop.delete()
      }
    }
  }
  return found.sort((a, b) => b.score - a.score)[0] ?? null
}

export function detectWithReferences(
  cv,
  source,
  references,
  proposals = [],
  options = {}
) {
  if (!references.length) return null
  const candidates =
    !options.skipLayout && references[0]?.side
      ? detectCard(cv, source, { all: true })
      : []
  const layout =
    !options.skipLayout &&
    detectByLayout(cv, source, references, [
      ...candidates.slice(0, 24),
      ...proposals,
    ])
  if (layout) return layout
  const direct = search(cv, source, references)
  if (direct) return direct
  const normalized = normalizeExposure(cv, source)
  try {
    const result = detectNormalized(cv, normalized, references, proposals)
    return result ? { ...result, exposureNormalized: true } : null
  } finally {
    normalized.delete()
  }
}
