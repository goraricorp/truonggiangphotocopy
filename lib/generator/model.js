export const foldText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()

export function detectVariant(text, side, cues = {}) {
  const normalized = foldText(text).replace(/[^A-Z0-9]+/g, " ")
  if (side === "front") {
    if (cues.qr || /CONG DAN/.test(normalized)) return "fingerprint"
    if (/CAN CUOC/.test(normalized)) return "modern"
  }
  if (side === "back") {
    if (cues.qr && !cues.fingerprints) return "modern"
    if (cues.fingerprints && !cues.qr) return "fingerprint"
    if (/NGON TRO|INDEX FINGER|DAC DIEM NHAN DANG/.test(normalized))
      return "fingerprint"
    if (/NOI DANG KY KHAI SINH|PLACE OF BIRTH REGISTRATION/.test(normalized))
      return "modern"
  }
  return null
}
export function resolveVariant(front, back, override = "auto") {
  if (["fingerprint", "modern"].includes(override)) return override
  if (front && back && front !== back)
    throw new Error(
      "Hai mặt đang thuộc hai loại thẻ khác nhau. Hãy kiểm tra lại ảnh hoặc chọn đúng mẫu."
    )
  return front || back || null
}
export function normalizeMrz(text) {
  return String(text ?? "")
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s/g, ""))
    .filter(Boolean)
    .join("\n")
}
export function inspectMrz(text) {
  const lines = normalizeMrz(text).split("\n")
  if (lines.length !== 3 || lines.some((line) => !/^[A-Z0-9<]{30}$/.test(line)))
    return {
      valid: false,
      message:
        "MRZ chưa đủ 3 dòng, mỗi dòng 30 ký tự. Bản xuất sẽ giữ ảnh MRZ gốc để tránh thay sai mã.",
    }
  // Validate only. Never generate or repair a missing MRZ/check digit.
  const check = (value, digit) => {
    const weights = [7, 3, 1]
    const sum = [...value].reduce(
      (total, c, i) =>
        total +
        (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55) *
          weights[i % 3],
      0
    )
    return /^\d$/.test(digit) && sum % 10 === Number(digit)
  }
  const [a, b] = lines
  const valid =
    check(a.slice(5, 14), a[14]) &&
    check(b.slice(0, 6), b[6]) &&
    check(b.slice(8, 14), b[14]) &&
    check(
      a.slice(5, 30) + b.slice(0, 7) + b.slice(8, 15) + b.slice(18, 29),
      b[29]
    )
  return {
    valid,
    message: valid
      ? "Cấu trúc và các số kiểm tra MRZ phù hợp; hãy đối chiếu với ảnh gốc."
      : "Số kiểm tra MRZ chưa khớp. Bản xuất sẽ giữ ảnh MRZ gốc; không tự sửa hoặc sinh lại mã.",
  }
}
export function ocrWords(data) {
  return (data.blocks ?? []).flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) =>
        (line.words ?? []).map((word) => ({
          text: word.text,
          confidence: word.confidence,
          box: word.bbox,
          row: line.bbox.y0,
        }))
      )
    )
  )
}
export function readField(words, definition, width, height) {
  const [x0, y0, x1, y1] = definition.box
  const selected = words
    .filter((word) => {
      const x = (word.box.x0 + word.box.x1) / 2 / width
      const y = (word.box.y0 + word.box.y1) / 2 / height
      return x >= x0 && x <= x1 && y >= y0 && y <= y1
    })
    .sort((a, b) => a.row - b.row || a.box.x0 - b.box.x0)
  const raw = selected
    .map((word) => word.text)
    .join(" ")
    .trim()
  let value
  if (definition.kind === "number")
    value = raw.replace(/\s/g, "").match(/(?<!\d)\d{12}(?!\d)/)?.[0] ?? ""
  else if (definition.kind === "date")
    value = raw.match(/\d{2}[/.]\d{2}[/.]\d{4}/)?.[0] ?? ""
  else
    value = raw
      .replace(
        /^(?:.*?)(?:P(?:l)?ace of residence|Place of origin|Full name|Personal identification|Place of birth registration)\s*[:/.]?\s*/i,
        ""
      )
      .replace(
        /^(?:Họ và tên|Full name|Nationality|Quốc tịch|Giới tính|Sex|Nơi thường trú|Place of residence)\s*[:/]?\s*/i,
        ""
      )
  if (definition.key === "sex")
    value = raw.match(/(?:^|\s)(Nam|Nữ)(?=\s|$)/iu)?.[1] ?? ""
  if (definition.key === "nationality")
    value = raw.match(/Vi[eệ]t\s*Nam/iu)?.[0] ?? ""
  const relevant =
    definition.kind === "date" || definition.kind === "number"
      ? selected.filter((word) => /\d/.test(word.text))
      : definition.key === "sex" || definition.key === "nationality"
        ? selected.filter(
            (word) =>
              value &&
              foldText(value).split(/\s+/).includes(foldText(word.text))
          )
        : selected
  const confidence = relevant.length
    ? Math.round(
        relevant.reduce((sum, w) => sum + w.confidence, 0) / relevant.length
      )
    : 0
  const bounds =
    relevant.length && value
      ? [
          Math.min(...relevant.map((w) => w.box.x0)),
          Math.min(...relevant.map((w) => w.box.y0)),
          Math.max(...relevant.map((w) => w.box.x1)),
          Math.max(...relevant.map((w) => w.box.y1)),
        ]
      : null
  return { value, confidence, bounds }
}

export function preferReading(previous, next, key) {
  if (!next.value) return previous
  if (key === "name" && previous.value) {
    const before = foldText(previous.value).trim(),
      after = foldText(next.value).trim()
    if (after.startsWith(before + " "))
      return {
        ...next,
        value: next.value
          .split(/\s+/)
          .slice(0, previous.value.split(/\s+/).length)
          .join(" "),
        confidence: Math.min(previous.confidence, next.confidence),
      }
    if (before !== after)
      return {
        ...previous,
        confidence: Math.min(79, previous.confidence),
        disagreement: true,
      }
  }
  return next.confidence >= previous.confidence ? next : previous
}
