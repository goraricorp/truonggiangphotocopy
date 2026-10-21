import { CARD, mmToPx } from "../identify/model.js"
import { withDensity } from "../identify/export.js"
import { inspectMrz, normalizeMrz, readField, preferReading } from "./model.js"
import { templates } from "./templates.js"

export function extractFields(ocr, variant, side, width, height) {
  return Object.fromEntries(
    templates[variant][side].fields.map((definition) => {
      const reading = readField(
        ocr.words,
        { ...definition, box: definition.sourceBox ?? definition.box },
        width,
        height
      )
      return [
        definition.key,
        {
          ...reading,
          sourceBounds: reading.bounds?.map(
            (v, i) => v / (i % 2 ? height : width)
          ),
          edited: false,
        },
      ]
    })
  )
}
function copyRegion(context, image, box, width, height, sourceBox = box) {
  const [x0, y0, x1, y1] = box
  const [sx0, sy0, sx1, sy1] = sourceBox
  context.drawImage(
    image,
    sx0 * image.width,
    sy0 * image.height,
    (sx1 - sx0) * image.width,
    (sy1 - sy0) * image.height,
    x0 * width,
    y0 * height,
    (x1 - x0) * width,
    (y1 - y0) * height
  )
}
function drawValue(context, value, box, width, height, mono = false) {
  const [x0, y0, x1, y1] = box
  const availableWidth = (x1 - x0) * width,
    availableHeight = (y1 - y0) * height
  let size = Math.min(mono ? 46 : 27, availableHeight * 0.72),
    lines = []
  // Shrink to fit whole words/lines rather than clipping names or addresses.
  for (; size >= 6; size -= 1) {
    context.font = `${mono ? "" : "500 "}${size}px ${mono ? "monospace" : "Arial, sans-serif"}`
    lines = []
    for (const paragraph of value.split(/\r?\n/)) {
      let line = ""
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word
        if (line && context.measureText(next).width > availableWidth) {
          lines.push(line)
          line = word
        } else line = next
      }
      lines.push(line)
    }
    if (
      lines.length * size * 1.15 <= availableHeight &&
      lines.every((line) => context.measureText(line).width <= availableWidth)
    )
      break
  }
  if (size < 6)
    throw new Error(
      "Thông tin quá dài so với vùng mẫu. Hãy kiểm tra lại chữ OCR trước khi xuất."
    )
  context.fillStyle = "#111"
  context.textBaseline = "top"
  lines.forEach((line, i) =>
    context.fillText(line, x0 * width, y0 * height + i * size * 1.15)
  )
}
export async function renderTemplate(variant, side, data) {
  const template = templates[variant]
  if (!template || !data?.crop) throw new Error("Chưa có mẫu hoặc ảnh đã cắt.")
  const definition = template[side]
  const source = await createImageBitmap(data.crop)
  let background
  try {
    const response = await fetch(template.url)
    if (!response.ok) throw new Error("Không tải được ảnh mẫu.")
    background = await createImageBitmap(await response.blob())
    const canvas = document.createElement("canvas")
    canvas.width = mmToPx(CARD.width)
    canvas.height = mmToPx(CARD.height)
    const ctx = canvas.getContext("2d"),
      width = canvas.width,
      height = canvas.height
    if (!ctx) throw new Error("Không khởi tạo được ảnh mẫu.")
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(background, ...definition.rect, 0, 0, width, height)
    for (const box of definition.patches)
      copyRegion(ctx, source, box, width, height)
    for (const field of definition.fields) {
      if (field.caption)
        drawValue(ctx, field.caption, field.captionBox, width, height)
      const item = data.fields[field.key]
      // An uncertain reading never silently replaces the original photograph.
      if (
        item?.value?.trim() &&
        (item.edited || item.useText || item.confidence >= 80)
      )
        drawValue(ctx, item.value.trim(), field.box, width, height)
      else if (!(field.optional && !item?.value)) {
        if (field.sourceBoxes) {
          const [x0, y0, x1, y1] = field.box
          field.sourceBoxes.forEach((sourceBox, i) =>
            copyInk(
              ctx,
              source,
              sourceBox,
              [
                x0,
                y0 + ((y1 - y0) * i) / field.sourceBoxes.length,
                x1,
                y0 + ((y1 - y0) * (i + 1)) / field.sourceBoxes.length,
              ],
              width,
              height
            )
          )
        } else
          copyInk(
            ctx,
            source,
            item?.sourceBounds ?? field.sourceBox ?? field.box,
            field.box,
            width,
            height
          )
      }
    }
    if (definition.mrz) {
      if (inspectMrz(data.mrz).valid)
        drawValue(
          ctx,
          normalizeMrz(data.mrz),
          definition.mrz,
          width,
          height,
          true
        )
      else
        copyInk(
          ctx,
          source,
          definition.sourceMrz,
          definition.mrz,
          width,
          height
        )
    }
    const result = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    )
    if (!result) throw new Error("Không tạo được ảnh kết quả.")
    return withDensity(result, 300)
  } finally {
    source.close()
    background?.close()
  }
}
export async function mrzImage(blob, box, contrast = 1.5) {
  const source = await createImageBitmap(blob)
  try {
    const [x0, y0, x1, y1] = box
    const canvas = document.createElement("canvas")
    canvas.width = Math.round((x1 - x0) * source.width * 2)
    canvas.height = Math.round((y1 - y0) * source.height * 2)
    const ctx = canvas.getContext("2d")
    ctx.filter = `grayscale(1) contrast(${contrast})`
    ctx.drawImage(
      source,
      x0 * source.width,
      y0 * source.height,
      (x1 - x0) * source.width,
      (y1 - y0) * source.height,
      0,
      0,
      canvas.width,
      canvas.height
    )
    return canvas
  } finally {
    source.close()
  }
}

// Local adaptive threshold keeps the original glyphs without pasting a dark
// rectangular photo background onto a bright template. No missing strokes added.
function copyInk(context, source, sourceBox, targetBox, width, height) {
  const [x0, y0, x1, y1] = sourceBox
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round((x1 - x0) * source.width))
  canvas.height = Math.max(1, Math.round((y1 - y0) * source.height))
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(
    source,
    x0 * source.width,
    y0 * source.height,
    (x1 - x0) * source.width,
    (y1 - y0) * source.height,
    0,
    0,
    canvas.width,
    canvas.height
  )
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixels = frame.data
  const w = canvas.width,
    h = canvas.height,
    stride = w + 1
  const sums = new Float64Array(stride * (h + 1)),
    light = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        v = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722
      light[y * w + x] = v
      row += v
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = Math.max(0, x - 12),
        r = Math.min(w, x + 13),
        t = Math.max(0, y - 12),
        b = Math.min(h, y + 13)
      const mean =
        (sums[b * stride + r] -
          sums[t * stride + r] -
          sums[b * stride + l] +
          sums[t * stride + l]) /
        ((r - l) * (b - t))
      const i = (y * w + x) * 4,
        alpha = light[y * w + x] < Math.min(160, mean - 22) ? 255 : 0
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
      pixels[i + 3] = alpha
    }
  ctx.putImageData(frame, 0, 0)
  const [tx0, ty0, tx1, ty1] = targetBox
  const scale = Math.min(
    ((tx1 - tx0) * width) / canvas.width,
    ((ty1 - ty0) * height) / canvas.height
  )
  context.drawImage(
    canvas,
    tx0 * width,
    ty0 * height,
    canvas.width * scale,
    canvas.height * scale
  )
}
export async function readFields(reader, ocr, variant, side, blob) {
  const fields = extractFields(ocr, variant, side, 1011, 638)
  for (const definition of templates[variant][side].fields) {
    const box = definition.sourceBox ?? definition.box
    const image = definition.sourceBoxes
      ? await joinedRegions(blob, definition.sourceBoxes)
      : await mrzImage(blob, box, 1.25)
    const result = await reader.recognize(
      image,
      false,
      box[3] - box[1] > 0.1 ? "block" : "line"
    )
    const reading = readField(
      result.words,
      { ...definition, box: [0, 0, 1, 1] },
      image.width,
      image.height
    )
    const preferred = preferReading(
      fields[definition.key],
      reading,
      definition.key
    )
    if (preferred === fields[definition.key]) continue
    if (preferred.disagreement) {
      fields[definition.key] = preferred
      continue
    }
    const sourceBounds = definition.sourceBoxes
      ? undefined
      : preferred.bounds?.map(
          (v, i) =>
            box[i % 2] +
            (v / (i % 2 ? image.height : image.width)) *
              (box[(i % 2) + 2] - box[i % 2])
        )
    fields[definition.key] = { ...preferred, sourceBounds, edited: false }
  }
  return fields
}

async function joinedRegions(blob, boxes) {
  const source = await createImageBitmap(blob)
  try {
    const canvas = document.createElement("canvas")
    const rowHeight = Math.ceil(
      Math.max(...boxes.map((box) => (box[3] - box[1]) * source.height)) * 2
    )
    canvas.width = Math.ceil(
      Math.max(...boxes.map((box) => (box[2] - box[0]) * source.width)) * 2
    )
    canvas.height = rowHeight * boxes.length
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.filter = "grayscale(1) contrast(1.25)"
    boxes.forEach(([x0, y0, x1, y1], i) =>
      ctx.drawImage(
        source,
        x0 * source.width,
        y0 * source.height,
        (x1 - x0) * source.width,
        (y1 - y0) * source.height,
        0,
        rowHeight * i,
        (x1 - x0) * source.width * 2,
        (y1 - y0) * source.height * 2
      )
    )
    return canvas
  } finally {
    source.close()
  }
}
