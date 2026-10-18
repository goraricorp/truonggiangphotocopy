// Hue and spatial color distribution are learned from each supplied reference.
// They verify an outline; they never recolor the user's photograph.
export function cardAppearance(image, mask) {
  const pixels = image.data,
    maskPixels = mask?.data
  const cells = Array.from({ length: 24 }, () => ({ count: 0, cyan: 0 }))
  const histogram = Array(12).fill(0)
  let count = 0,
    cyan = 0
  for (let y = 0; y < image.rows; y += 2)
    for (let x = 0; x < image.cols; x += 2) {
      if (maskPixels && !maskPixels[y * mask.cols + x]) continue
      const index = (y * image.cols + x) * 4
      const r = pixels[index] / 255,
        g = pixels[index + 1] / 255,
        b = pixels[index + 2] / 255
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min
      if (max < 0.08 || (max > 0.99 && delta < 0.02)) continue
      let hue =
        delta < 0.001
          ? 0
          : max === r
            ? ((g - b) / delta + 6) % 6
            : max === g
              ? (b - r) / delta + 2
              : (r - g) / delta + 4
      hue *= 60
      const saturated = delta / Math.max(max, 0.001) > 0.045
      const blue = saturated && hue >= 145 && hue <= 225
      const cell =
        cells[
          Math.min(3, Math.floor((y / image.rows) * 4)) * 6 +
            Math.min(5, Math.floor((x / image.cols) * 6))
        ]
      cell.count++
      count++
      if (blue) {
        cell.cyan++
        cyan++
      }
      if (saturated) {
        // Interpolate neighboring hue bins: rounding under weak light must not
        // turn a 149°/150° shift into two completely different colors.
        const position = hue / 30,
          bin = Math.floor(position) % 12,
          fraction = position - Math.floor(position)
        histogram[bin] += 1 - fraction
        histogram[(bin + 1) % 12] += fraction
      }
    }
  const total = histogram.reduce((a, b) => a + b, 0)
  return {
    cyan: cyan / Math.max(count, 1),
    histogram: histogram.map((n) => n / Math.max(total, 1)),
    cells: cells.map((c) => c.cyan / Math.max(c.count, 1)),
  }
}
export function compareAppearance(actual, expected) {
  const color = actual.histogram.reduce(
    (sum, n, i) => sum + Math.sqrt(n * expected.histogram[i]),
    0
  )
  const spatial =
    1 -
    actual.cells.reduce(
      (sum, n, i) => sum + Math.abs(n - expected.cells[i]),
      0
    ) /
      24
  return {
    accepted:
      actual.cyan >= Math.max(0.035, expected.cyan * 0.18) &&
      color >= 0.58 &&
      spatial >= 0.4,
    score: color * 0.6 + spatial * 0.4,
  }
}
