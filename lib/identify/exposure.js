// A single neutral black/white point preserves hue: never normalize RGB channels separately.
// The returned Mat belongs to the caller; source pixels are never modified.
export function normalizeExposure(cv, source) {
  const histogram = new Uint32Array(256)
  const histogramPixels = source.data
  let count = 0
  for (let i = 0; i < histogramPixels.length; i += 16) {
    if (histogramPixels[i + 3] < 128) continue
    const value = Math.round(
      histogramPixels[i] * 0.2126 +
        histogramPixels[i + 1] * 0.7152 +
        histogramPixels[i + 2] * 0.0722
    )
    histogram[value]++
    count++
  }
  const percentile = (fraction) => {
    let total = 0
    for (let i = 0; i < 256; i++) {
      total += histogram[i]
      if (total >= count * fraction) return i
    }
    return 255
  }
  const black = percentile(0.015),
    white = percentile(0.985),
    median = percentile(0.5)
  const result = new cv.Mat()
  source.copyTo(result)
  // A uniform, burned-out or almost-black image contains no recoverable color.
  if (!count || white - black < 12) return result
  const middle = Math.max(
    0.02,
    Math.min(0.98, (median - black) / (white - black))
  )
  const gamma = Math.max(0.65, Math.min(1.5, Math.log(0.62) / Math.log(middle)))
  const scale = 255 / (white - black)
  const pixels = source.data,
    output = result.data
  for (let i = 0; i < output.length; i += 4) {
    const red = Math.max(0, (pixels[i] - black) * scale),
      green = Math.max(0, (pixels[i + 1] - black) * scale),
      blue = Math.max(0, (pixels[i + 2] - black) * scale)
    const light = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
    const gain = light > 0 ? Math.pow(light, gamma) / light : 1
    const safeGain = Math.min(gain, 255 / Math.max(1, red, green, blue))
    output[i] = Math.round(red * safeGain)
    output[i + 1] = Math.round(green * safeGain)
    output[i + 2] = Math.round(blue * safeGain)
  }
  return result
}
