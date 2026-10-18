import {
  A4,
  CARD,
  mmToPx,
  mmToPt,
  pageLayout,
  exportSchema,
  readyCards,
} from "./model.js"

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
export async function withDensity(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (blob.type === "image/png") {
    const chunk = new Uint8Array(21),
      view = new DataView(chunk.buffer)
    view.setUint32(0, 9)
    chunk.set([112, 72, 89, 115], 4)
    const ppm = Math.round(dpi / 0.0254)
    view.setUint32(8, ppm)
    view.setUint32(12, ppm)
    chunk[16] = 1
    view.setUint32(17, crc32(chunk.slice(4, 17)))
    const parts = [bytes.slice(0, 33), chunk]
    let offset = 33
    while (offset < bytes.length) {
      const length =
        new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0) +
        12
      if (
        String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) !== "pHYs"
      )
        parts.push(bytes.slice(offset, offset + length))
      offset += length
    }
    return new Blob(parts, { type: blob.type })
  }
  if (blob.type === "image/jpeg") {
    if (
      bytes[2] === 255 &&
      bytes[3] === 224 &&
      String.fromCharCode(...bytes.slice(6, 11)) === "JFIF\0"
    ) {
      bytes[13] = 1
      bytes[14] = dpi >> 8
      bytes[15] = dpi & 255
      bytes[16] = dpi >> 8
      bytes[17] = dpi & 255
      return new Blob([bytes], { type: blob.type })
    }
    return new Blob(
      [
        bytes.slice(0, 2),
        new Uint8Array([
          255,
          224,
          0,
          16,
          74,
          70,
          73,
          70,
          0,
          1,
          1,
          1,
          dpi >> 8,
          dpi & 255,
          dpi >> 8,
          dpi & 255,
          0,
          0,
        ]),
        bytes.slice(2),
      ],
      { type: blob.type }
    )
  }
  return blob
}
export async function makeDocument(cards, options) {
  const selected = readyCards(cards),
    config = exportSchema.parse(options),
    layout = pageLayout(config.gap)
  if (config.format === "pdf") {
    const { PDFDocument } = await import("pdf-lib"),
      doc = await PDFDocument.create()
    for (const card of selected) {
      const page = doc.addPage([mmToPt(A4.width), mmToPt(A4.height)])
      for (const [side, top] of [
        ["front", layout.top],
        ["back", layout.backTop],
      ]) {
        const image = await doc.embedPng(await card[side].result.arrayBuffer())
        page.drawImage(image, {
          x: mmToPt(layout.x),
          y: mmToPt(A4.height - top - CARD.height),
          width: mmToPt(CARD.width),
          height: mmToPt(CARD.height),
        })
      }
    }
    return new Blob([await doc.save()], { type: "application/pdf" })
  }
  if (config.format === "docx") {
    const {
      Document,
      Packer,
      Paragraph,
      ImageRun,
      SectionType,
      HorizontalPositionRelativeFrom,
      VerticalPositionRelativeFrom,
      TextWrappingType,
    } = await import("docx")
    const sections = []
    for (const card of selected) {
      const images = []
      for (const [side, top] of [
        ["front", layout.top],
        ["back", layout.backTop],
      ])
        images.push(
          new ImageRun({
            type: "png",
            data: new Uint8Array(await card[side].result.arrayBuffer()),
            transformation: {
              width: (CARD.width * 96) / 25.4,
              height: (CARD.height * 96) / 25.4,
            },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: Math.round(layout.x * 36000),
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: Math.round(top * 36000),
              },
              wrap: { type: TextWrappingType.NONE },
              allowOverlap: true,
            },
          })
        )
      sections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: {
              width: Math.round((A4.width * 1440) / 25.4),
              height: Math.round((A4.height * 1440) / 25.4),
            },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children: [
          new Paragraph({ spacing: { before: 0, after: 0 }, children: images }),
        ],
      })
    }
    return Packer.toBlob(new Document({ sections }))
  }
  const width = mmToPx(A4.width, config.dpi),
    pageHeight = mmToPx(A4.height, config.dpi),
    height = pageHeight * selected.length
  if (height > 30000 || width * height > 60000000)
    throw new Error(
      "Ảnh dài vượt giới hạn bộ nhớ an toàn. Hãy chọn ít CCCD hơn hoặc xuất PDF/Word để giữ đủ trang và chất lượng."
    )
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Không đủ bộ nhớ để tạo ảnh. Hãy xuất PDF.")
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, width, height)
  for (let i = 0; i < selected.length; i++)
    for (const [side, top] of [
      ["front", layout.top],
      ["back", layout.backTop],
    ]) {
      const bitmap = await createImageBitmap(selected[i][side].result)
      ctx.drawImage(
        bitmap,
        mmToPx(layout.x, config.dpi),
        i * pageHeight + mmToPx(top, config.dpi),
        mmToPx(CARD.width, config.dpi),
        mmToPx(CARD.height, config.dpi)
      )
      bitmap.close()
    }
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, `image/${config.format}`, config.quality)
  )
  canvas.width = 1
  canvas.height = 1
  if (!blob) throw new Error("Không thể tạo ảnh dài. Hãy xuất PDF.")
  return withDensity(blob, config.dpi)
}
export function fileName(format) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date())
  return `photo-cccd-${date}.${format === "jpeg" ? "jpg" : format}`
}
