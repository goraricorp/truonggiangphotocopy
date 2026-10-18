import { orderCorners, validCorners } from "./model.js"
// DocAligner heatmap_reg/infer.py: BGR NCHW float32 / 255, 256 x 256.
export function prepareDocAligner(cv, source) {
  const resized = new cv.Mat(),
    data = new Float32Array(3 * 256 * 256)
  try {
    cv.resize(source, resized, new cv.Size(256, 256), 0, 0, cv.INTER_LINEAR)
    const pixels = resized.data
    const plane = 256 * 256
    for (let i = 0; i < plane; i++) {
      data[i] = pixels[i * 4 + 2] / 255
      data[plane + i] = pixels[i * 4 + 1] / 255
      data[2 * plane + i] = pixels[i * 4] / 255
    }
    return data
  } finally {
    resized.delete()
  }
}
// Threshold each corner channel and take the centroid of its largest component,
// mirroring the upstream heatmap postprocessor. Resize before thresholding.
export function decodeDocAligner(cv, tensor, width, height) {
  const [batch, channels, rows, cols] = tensor.dims
  if (
    batch !== 1 ||
    channels !== 4 ||
    rows < 2 ||
    cols < 2 ||
    tensor.data.length !== 4 * rows * cols
  )
    return null
  const points = [],
    peaks = []
  for (let channel = 0; channel < 4; channel++) {
    const values = tensor.data.subarray(
      channel * rows * cols,
      (channel + 1) * rows * cols
    )
    let peak = 0
    for (const value of values)
      if (Number.isFinite(value)) peak = Math.max(peak, value)
    if (peak < 0.3) return null
    peaks.push(peak)
    const map = cv.matFromArray(rows, cols, cv.CV_32F, values),
      resized = new cv.Mat(),
      mask = new cv.Mat(),
      hierarchy = new cv.Mat(),
      contours = new cv.MatVector()
    try {
      cv.resize(map, resized, new cv.Size(width, height), 0, 0, cv.INTER_LINEAR)
      cv.threshold(resized, resized, 0.3, 0, cv.THRESH_TOZERO)
      resized.convertTo(mask, cv.CV_8U, 255)
      cv.threshold(mask, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )
      let largest = null,
        area = 0
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        try {
          const size = cv.contourArea(contour)
          if (size > area) {
            const moments = cv.moments(contour)
            if (moments.m00 > 0) {
              area = size
              largest = {
                x: moments.m10 / moments.m00,
                y: moments.m01 / moments.m00,
              }
            }
          }
        } finally {
          contour.delete()
        }
      }
      if (!largest) return null
      points.push(largest)
    } finally {
      map.delete()
      resized.delete()
      mask.delete()
      hierarchy.delete()
      contours.delete()
    }
  }
  const ordered = orderCorners(points)
  if (
    !validCorners(
      ordered.map((p) => ({ x: p.x / (width - 1), y: p.y / (height - 1) }))
    )
  )
    return null
  return {
    points: ordered,
    confidence: Math.min(...peaks),
    method: "doc-aligner",
  }
}

export function docAlignerViews(mode = "all") {
  const views = [
    [0, 0, 1, 1],
    [-0.25, -0.25, 1.5, 1.5],
    [-0.5, -0.5, 2, 2],
    [0, 0, 0.6, 0.6],
    [0.4, 0, 0.6, 0.6],
    [0, 0.4, 0.6, 0.6],
    [0.4, 0.4, 0.6, 0.6],
  ]
  return mode === "primary"
    ? views.slice(0, 1)
    : mode === "additional"
      ? views.slice(1)
      : views
}
