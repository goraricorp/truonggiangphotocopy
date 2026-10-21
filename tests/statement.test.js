import { describe, expect, test } from "vitest"
import JSZip from "jszip"
import { statementDefaults } from "../utils/constant.js"
import {
  extractParagraphs,
  paragraph,
  readyPages,
  validateSettings,
} from "../lib/statement/model.js"
import { makeWord, printHtml } from "../lib/statement/export.js"
const page = (text = "Tiếng Việt có dấu") => ({
  status: "ready",
  paragraphs: [paragraph(text)],
})
const line = (text, x0, y0, x1, y1, extra = {}) => ({
  bbox: { x0, y0, x1, y1 },
  words: [{ text, bbox: { x0, y0, x1, y1 }, ...extra }],
})
describe("trang văn bản theo đúng thứ tự", () => {
  test("không tự sắp xếp lại khi xuất và không giới hạn số trang", () => {
    const pages = Array.from({ length: 501 }, (_, i) => page(`Trang ${i + 1}`))
    expect(readyPages(pages)).toBe(pages)
    const html = printHtml([page("Trang BA"), page("Trang MỘT")])
    expect(html.indexOf("Trang BA")).toBeLessThan(html.indexOf("Trang MỘT"))
  })
  test("không xuất âm thầm thiếu trang đang đọc hoặc bị lỗi", () => {
    expect(() => readyPages([])).toThrow()
    expect(() =>
      readyPages([page(), { ...page(), status: "reading" }])
    ).toThrow()
    expect(() => readyPages([page(" ")])).toThrow()
    expect(() => readyPages([page(), { ...page(), status: "error" }])).toThrow()
  })
  test("mặc định đúng font, cỡ chữ và lề đơn vị mm", () => {
    expect(validateSettings()).toEqual({
      font: "Times New Roman",
      fontSize: 14,
      left: 30,
      right: 20,
      top: 20,
      bottom: 20,
      lineSpacing: 1.5,
    })
    expect(() => validateSettings({ ...statementDefaults, left: -1 })).toThrow()
    expect(() =>
      validateSettings({ ...statementDefaults, fontSize: 0 })
    ).toThrow()
    expect(() => validateSettings({ ...statementDefaults, top: NaN })).toThrow()
  })
})
describe("giữ đoạn và định dạng OCR", () => {
  test("giữ nguyên chữ tiếng Việt và xuống dòng", () => {
    const result = extractParagraphs(
      { text: "Đoạn một\nDòng hai\n\nĐoạn ba" },
      1000,
      1400
    )
    expect(result.map((p) => p.text)).toEqual(["Đoạn một\nDòng hai", "Đoạn ba"])
    expect(extractParagraphs({ text: "" }, 1000, 1400)).toEqual([])
  })
  test("tiêu đề giữa, chữ đậm và đoạn căn phải", () => {
    const blocks = [
      {
        paragraphs: [
          { lines: [line("Nội dung văn bản", 100, 250, 900, 300)] },
          { lines: [line("TIÊU ĐỀ", 350, 100, 650, 150)] },
          {
            lines: [line("Người ký", 650, 800, 900, 840, { is_italic: true })],
          },
        ],
      },
    ]
    const result = extractParagraphs({ blocks }, 1000, 1400)
    expect(result[1]).toMatchObject({
      text: "TIÊU ĐỀ",
      alignment: "center",
      bold: true,
    })
    expect(result[2]).toMatchObject({ alignment: "right", italic: true })
  })
  test("tiêu đề giữa trang vẫn căn giữa khi phần thân có các dòng ngắn", () => {
    const blocks = [
      {
        paragraphs: [
          { lines: [line("Đoạn văn ngắn", 100, 250, 700, 280)] },
          { lines: [line("TIÊU ĐỀ", 350, 100, 650, 150)] },
        ],
      },
    ]
    expect(extractParagraphs({ blocks }, 1000)[1].alignment).toBe("center")
  })
  test("nhận bảng nhiều hàng và giữ nội dung từng ô", () => {
    const row = (y) => ({
      bbox: { x0: 100, y0: y, x1: 900, y1: y + 30 },
      words: [
        { text: "Cột A", bbox: { x0: 100, y0: y, x1: 250, y1: y + 30 } },
        { text: "Cột B", bbox: { x0: 600, y0: y, x1: 900, y1: y + 30 } },
      ],
    })
    expect(
      extractParagraphs(
        { blocks: [{ paragraphs: [{ lines: [row(100), row(150)] }] }] },
        1000,
        1400
      )[0]
    ).toMatchObject({ type: "table", text: "Cột A\tCột B\nCột A\tCột B" })
  })
})
describe("xuất văn bản thực", () => {
  test("PDF HTML dùng A4, lề 2/2/2/3 cm, font 14 và ngắt trang", () => {
    const html = printHtml([page(), page("Trang sau")])
    expect(html).toContain("margin:20mm 20mm 20mm 30mm")
    expect(html).toContain("font-size:14pt")
    expect(html).toContain("Times New Roman")
    expect(html).toContain("break-before:page")
    expect(html.match(/<section>/g)).toHaveLength(2)
    expect(html).not.toContain("<img")
  })
  test("nội dung người dùng không chèn được HTML/script vào cửa sổ PDF", () => {
    const html = printHtml([page('<script>alert("x")</script> & nội dung')])
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
  test("Word chứa chữ Unicode, lề đúng, font 14, bảng và thứ tự các trang", async () => {
    const first = page("Trang đầu tiên có dấu")
    first.paragraphs.push(
      paragraph("Ô một\tÔ hai\nDòng hai\tNội dung", { type: "table" })
    )
    const blob = await makeWord([first, page("Trang thứ hai")])
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file("word/document.xml").async("string")
    expect(xml).toContain("Trang đầu tiên có dấu")
    expect(xml.indexOf("Trang đầu tiên")).toBeLessThan(
      xml.indexOf("Trang thứ hai")
    )
    expect(xml).toContain('w:left="1701"')
    expect(xml).toContain('w:right="1134"')
    expect(xml).toContain('w:top="1134"')
    expect(xml).toContain('w:bottom="1134"')
    expect(xml).toContain('w:sz w:val="28"')
    expect(xml).toContain("Times New Roman")
    expect(xml).toContain("<w:tbl>")
    expect(
      Object.keys(zip.files).some((path) => path.startsWith("word/media/"))
    ).toBe(false)
  })
})
