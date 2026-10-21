// Use the cyan security background, rather than portraits, text, fingerprints or
// blank fields in the reference, to measure exposure. All RGB channels receive
// the same luminance gain so this never copies/replaces template pixels.
export function cardToneProfile(pixels, padding) {
  const histogram = new Uint32Array(256)
  let count = 0
  for (let i = 0; i < pixels.length; i += 16) {
    if (padding?.[i] > 0 || pixels[i + 3] < 128) continue
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2]
    const maximum = Math.max(r, g, b),
      minimum = Math.min(r, g, b)
    if (maximum < 12 || maximum > 250 || (maximum - minimum) / maximum < 0.045)
      continue
    if (g < r * 1.025 || b < r * 0.98 || b > g * 1.4) continue
    histogram[Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)]++
    count++
  }
  if (count < 64) return null
  const quantile = (fraction) => {
    let total = 0
    for (let i = 0; i < 256; i++) {
      total += histogram[i]
      if (total >= count * fraction) return i
    }
    return 255
  }
  return [quantile(0.1), quantile(0.5), quantile(0.9)]
}

export function averageToneProfiles(profiles) {
  const valid = profiles.filter(Boolean)
  return valid.length
    ? [0, 1, 2].map(
        (i) => valid.reduce((sum, p) => sum + p[i], 0) / valid.length
      )
    : null
}

export function balanceCardTone(pixels, target, padding) {
  const source = cardToneProfile(pixels, padding)
  if (!source || !target || source[2] - source[0] < 8) return false
  // A monotonic curve preserves the ordering of light/dark details. Endpoints
  // keep black lettering black and white padding white, with bounded gains.
  const from = [0, ...source, 255],
    to = [0, ...target, 255]
  const curve = new Float64Array(256)
  for (let value = 0; value < 256; value++) {
    let segment = 0
    while (segment < 3 && value > from[segment + 1]) segment++
    const fraction =
      (value - from[segment]) / Math.max(1, from[segment + 1] - from[segment])
    const mapped = to[segment] + fraction * (to[segment + 1] - to[segment])
    curve[value] = value ? Math.max(0.55, Math.min(3, mapped / value)) : 1
  }
  for (let i = 0; i < pixels.length; i += 4) {
    if (padding?.[i] > 0) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
      continue
    }
    const maximum = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
    const value = Math.round(
      pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722
    )
    const gain = Math.min(curve[value], 255 / Math.max(1, maximum))
    pixels[i] = Math.round(pixels[i] * gain)
    pixels[i + 1] = Math.round(pixels[i + 1] * gain)
    pixels[i + 2] = Math.round(pixels[i + 2] * gain)
  }
  return true
}
