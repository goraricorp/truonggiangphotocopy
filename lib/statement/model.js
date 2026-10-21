import { statementDefaults } from "../../utils/constant.js"

export function validateSettings(settings = statementDefaults) {
  const value = { ...statementDefaults, ...settings }
  for (const key of ["left", "right", "top", "bottom"])
    if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 70)
      throw new Error("Lề trang phải từ 0 đến 7 cm.")
  if (value.left + value.right > 150 || value.top + value.bottom > 230)
    throw new Error("Các lề quá lớn, không còn đủ vùng văn bản trên A4.")
  if (
    !Number.isFinite(value.fontSize) ||
    value.fontSize < 8 ||
    value.fontSize > 36
  )
    throw new Error("Cỡ chữ phải từ 8 đến 36.")
  value.font = statementDefaults.font
  value.lineSpacing = statementDefaults.lineSpacing
  return value
}
export function readyPages(pages) {
  if (!pages.length) throw new Error("Hãy thêm ít nhất một ảnh trang văn bản.")
  if (
    pages.some(
      (page) =>
        page.status !== "ready" || !page.paragraphs.some((p) => p.text.trim())
    )
  )
    throw new Error(
      "Còn trang chưa đọc xong hoặc chưa có nội dung. Hãy bổ sung, xử lý lại hoặc xóa trang đó trước khi xuất."
    )
  return pages
}
export function paragraph(text = "", extra = {}) {
  return {
    text,
    alignment: "left",
    bold: false,
    italic: false,
    indent: 0,
    type: "paragraph",
    ...extra,
  }
}
const lineText = (line) =>
  (line.words ?? [])
    .map((word) => word.text)
    .join(" ")
    .trim() ||
  line.text?.trim() ||
  ""
function cellsOf(line, width) {
  const cells = []
  let previous,
    current = []
  for (const word of line.words ?? []) {
    if (previous && word.bbox.x0 - previous.bbox.x1 > width * 0.065) {
      cells.push(current.join(" "))
      current = []
    }
    current.push(word.text)
    previous = word
  }
  if (current.length) cells.push(current.join(" "))
  return cells
}
export function extractParagraphs(result, width) {
  const source = (result.blocks ?? []).flatMap(
    (block) => block.paragraphs ?? []
  )
  const allLines = source
    .flatMap((p) => p.lines ?? [])
    .filter((line) => lineText(line) && line.bbox)
  if (!allLines.length)
    return result.text?.trim()
      ? result.text
          .trim()
          .split(/\n\s*\n/)
          .map((text) => paragraph(text.trim()))
      : []
  const minX = Math.min(...allLines.map((l) => l.bbox.x0)),
    maxX = Math.max(...allLines.map((l) => l.bbox.x1))
  const span = Math.max(width * 0.3, maxX - minX),
    paragraphs = []
  for (const original of source) {
    const lines = (original.lines ?? []).filter(
      (line) => lineText(line) && line.bbox
    )
    if (!lines.length) continue
    const rows = lines.map((line) => cellsOf(line, width))
    const columns = rows[0]?.length
    if (
      rows.length >= 2 &&
      columns >= 2 &&
      columns <= 6 &&
      rows.every((row) => row.length === columns)
    ) {
      paragraphs.push(
        paragraph(rows.map((row) => row.join("\t")).join("\n"), {
          type: "table",
        })
      )
      continue
    }
    const text = lines.map(lineText).join("\n")
    const left = Math.min(...lines.map((l) => l.bbox.x0)),
      right = Math.max(...lines.map((l) => l.bbox.x1))
    let centered =
      left - minX > span * 0.12 &&
      maxX - right > span * 0.12 &&
      Math.abs((left + right) / 2 - (minX + maxX) / 2) < span * 0.08
    const rightAligned = left - minX > span * 0.45 && maxX - right < span * 0.06
    const words = lines.flatMap((line) => line.words ?? []),
      letters = text.replace(/[^\p{L}]/gu, "")
    const uppercase =
      letters.length >= 5 &&
      letters.length < 100 &&
      letters === letters.toUpperCase()
    const bold =
      words.filter((w) => w.is_bold).length > words.length * 0.5 || uppercase
    centered ||= bold && Math.abs((left + right) / 2 - width / 2) < width * 0.07
    const italic =
      words.length > 0 &&
      words.filter((w) => w.is_italic).length > words.length * 0.5
    // Preserve only a modest paragraph indent, not the camera/photo's outer margin.
    const indent =
      !centered &&
      !rightAligned &&
      left - minX > span * 0.035 &&
      left - minX < span * 0.16
        ? 10
        : 0
    paragraphs.push(
      paragraph(text, {
        alignment: centered ? "center" : rightAligned ? "right" : "left",
        bold,
        italic,
        indent,
      })
    )
  }
  return paragraphs
}
export async function preparePage(file) {
  const image = await createImageBitmap(file, {
    imageOrientation: "from-image",
  })
  try {
    if (
      image.width < 64 ||
      image.height < 64 ||
      image.width * image.height > 60000000
    )
      throw new Error(
        "Ảnh phải có mỗi chiều ít nhất 64px và không vượt 60 triệu điểm ảnh."
      )
    const scale = Math.min(1, 3200 / Math.max(image.width, image.height)),
      canvas = document.createElement("canvas")
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Không đủ bộ nhớ để đọc trang này.")
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.filter = "grayscale(1) contrast(1.1)"
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    image.close()
  }
}
