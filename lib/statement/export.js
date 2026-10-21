import { statementDefaults } from "../../utils/constant.js"
import { readyPages, validateSettings } from "./model.js"
const twips = (mm) => Math.round((mm * 1440) / 25.4)
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  )
export function tableRows(text) {
  return text.split(/\r?\n/).map((row) => row.split("\t"))
}
export function printHtml(pages, settings = statementDefaults) {
  readyPages(pages)
  const s = validateSettings(settings)
  const block = (item) => {
    const alignment = ["left", "center", "right", "justify"].includes(
      item.alignment
    )
      ? item.alignment
      : "left"
    const style = `text-align:${alignment};font-weight:${item.bold ? 700 : 400};font-style:${item.italic ? "italic" : "normal"};margin-left:${item.indent === 10 ? 10 : 0}mm`
    if (item.type === "table")
      return `<table style="${style}"><tbody>${tableRows(item.text)
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`
        )
        .join("")}</tbody></table>`
    return `<p style="${style}">${escape(item.text).replace(/\n/g, "<br>") || "&nbsp;"}</p>`
  }
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Văn bản đánh máy</title><style>
@page { size:A4; margin:${s.top}mm ${s.right}mm ${s.bottom}mm ${s.left}mm; }
* { box-sizing:border-box; } body { margin:0; font-family:"Times New Roman",Times,serif; font-size:${s.fontSize}pt; line-height:${s.lineSpacing}; color:#000; background:#fff; }
section+section { break-before:page; } p { margin-top:0; margin-bottom:8pt; white-space:pre-wrap; overflow-wrap:anywhere; orphans:2; widows:2; } table { width:100%;border-collapse:collapse; margin:0 0 8pt; table-layout:fixed; } td { border:1px solid #000;padding:4pt;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:top; } tr { break-inside:avoid; }
@media screen { body { max-width:${210 - s.left - s.right}mm; margin:24px auto; padding:12px; } section { margin-bottom:32px; } }
</style></head><body>${pages.map((page) => `<section>${page.paragraphs.map(block).join("")}</section>`).join("")}</body></html>`
}
export function printPdf(pages, settings) {
  const html = printHtml(pages, settings)
  const popup = window.open("", "_blank")
  if (!popup)
    throw new Error(
      "Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên để lưu PDF."
    )
  popup.opener = null
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.document.fonts.ready.then(() => {
    if (!popup.closed) {
      popup.focus()
      popup.print()
    }
  })
}
export async function makeWord(pages, settings = statementDefaults) {
  readyPages(pages)
  const s = validateSettings(settings)
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    SectionType,
    TableLayoutType,
  } = await import("docx")
  const makeParagraph = (item) =>
    new Paragraph({
      alignment:
        item.alignment === "justify"
          ? "both"
          : ["left", "right", "center"].includes(item.alignment)
            ? item.alignment
            : "left",
      indent: { left: twips(item.indent === 10 ? 10 : 0) },
      spacing: { after: 160, line: Math.round(240 * s.lineSpacing) },
      children: item.text
        .split(/\r?\n/)
        .map(
          (text, index) =>
            new TextRun({
              text,
              break: index ? 1 : 0,
              font: s.font,
              size: s.fontSize * 2,
              bold: item.bold,
              italics: item.italic,
            })
        ),
    })
  const sections = pages.map((page) => ({
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: twips(210), height: twips(297) },
        margin: {
          left: twips(s.left),
          right: twips(s.right),
          top: twips(s.top),
          bottom: twips(s.bottom),
        },
      },
    },
    children: page.paragraphs.flatMap((item) => {
      if (item.type !== "table") return [makeParagraph(item)]
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: tableRows(item.text).map(
          (row) =>
            new TableRow({
              children: row.map(
                (text) =>
                  new TableCell({
                    children: [makeParagraph({ ...item, text })],
                  })
              ),
            })
        ),
      })
      return [table, new Paragraph({ children: [] })]
    }),
  }))
  return Packer.toBlob(
    new Document({
      styles: {
        default: { document: { run: { font: s.font, size: s.fontSize * 2 } } },
      },
      sections,
    })
  )
}
