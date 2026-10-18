import { CARD, mmToPx } from "./model.js"

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
/** Map the pair of long edges to the horizontal direction, including portrait shots. */
export function landscapeCorners(points) {
  const width =
    (distance(points[0], points[1]) + distance(points[2], points[3])) / 2
  const height =
    (distance(points[0], points[3]) + distance(points[1], points[2])) / 2
  return width < height ? [points[1], points[2], points[3], points[0]] : points
}
/** A projective transform corrects in-plane rotation and perspective along both axes. Caller deletes returned Mat. */
export function rectifyCard(cv, src, corners, rotation = 0) {
  const width = mmToPx(CARD.width),
    height = mmToPx(CARD.height),
    swap = rotation % 2 === 1,
    warpW = swap ? height : width,
    warpH = swap ? width : height
  const from = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      landscapeCorners(corners).flatMap((p) => [p.x, p.y])
    ),
    to = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      warpW - 1,
      0,
      warpW - 1,
      warpH - 1,
      0,
      warpH - 1,
    ])
  const warped = new cv.Mat(),
    result = new cv.Mat()
  let transform
  try {
    transform = cv.getPerspectiveTransform(from, to)
    cv.warpPerspective(
      src,
      warped,
      transform,
      new cv.Size(warpW, warpH),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )
    if (rotation)
      cv.rotate(
        warped,
        result,
        [
          null,
          cv.ROTATE_90_CLOCKWISE,
          cv.ROTATE_180,
          cv.ROTATE_90_COUNTERCLOCKWISE,
        ][rotation]
      )
    else warped.copyTo(result)
    return result
  } catch (error) {
    result.delete()
    throw error
  } finally {
    from.delete()
    to.delete()
    transform?.delete()
    warped.delete()
  }
}
