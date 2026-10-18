import { describe, expect, test } from "vitest"
import {
  detectVariant,
  resolveVariant,
  inspectMrz,
  normalizeMrz,
  readField,
  preferReading,
  ocrWords,
} from "../lib/generator/model.js"
import { templates } from "../lib/generator/templates.js"
import { renderTemplate } from "../lib/generator/render.js"

describe("chọn mẫu theo loại CCCD", () => {
  test("mặt trước có chữ công dân dùng mẫu có vân tay", () => {
    expect(
      detectVariant("CĂN CƯỚC CÔNG DÂN\nCitizen Identity Card", "front")
    ).toBe("fingerprint")
    expect(detectVariant("CĂN CƯỚC\nIdentity Card", "front")).toBe("modern")
    expect(detectVariant("Ảnh không đọc rõ", "front")).toBeNull()
  })
  test("mặt sau có QR hoặc hai ô vân tay", () => {
    expect(detectVariant("", "back", { qr: true, fingerprints: false })).toBe(
      "modern"
    )
    expect(detectVariant("", "back", { qr: false, fingerprints: true })).toBe(
      "fingerprint"
    )
    expect(detectVariant("Ngón trỏ trái / Left index finger", "back")).toBe(
      "fingerprint"
    )
  })
  test("không âm thầm ghép hai loại khác nhau", () => {
    expect(() => resolveVariant("modern", "fingerprint")).toThrow("hai loại")
    expect(resolveVariant(null, "modern")).toBe("modern")
    expect(resolveVariant("modern", "fingerprint", "fingerprint")).toBe(
      "fingerprint"
    )
    expect(resolveVariant(null, null)).toBeNull()
  })
  test("ánh xạ đúng hai ảnh mẫu và các vùng không vượt khung", () => {
    expect(templates.fingerprint.url).toContain("new.png")
    expect(templates.modern.url).toContain("image.png")
    for (const template of Object.values(templates))
      for (const side of ["front", "back"])
        for (const box of [
          ...template[side].patches,
          ...template[side].fields.map((f) => f.box),
          ...(side === "back" ? [template.back.mrz] : []),
        ]) {
          expect(box.every((v) => v >= 0 && v <= 1)).toBe(true)
          expect(box[2]).toBeGreaterThan(box[0])
          expect(box[3]).toBeGreaterThan(box[1])
        }
  })
})
describe("giữ chính xác chữ và MRZ", () => {
  test("giữ dấu tiếng Việt, chữ O và số 0, không đoán ký tự thiếu", () => {
    expect(normalizeMrz(" A0O «< \n B0O \n C ")).toBe("A0O<<\nB0O\nC")
    expect(inspectMrz("IDVNM\nTHIEU\nDONG").valid).toBe(false)
  })
  test("MRZ TD1 chuẩn ICAO và mã hỏng số kiểm tra", () => {
    const text =
      "I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<"
    expect(inspectMrz(text).valid).toBe(true)
    expect(inspectMrz(text.replace("7408122", "7408123")).valid).toBe(false)
    expect(inspectMrz(text.replace("D231458907", "D231458908")).valid).toBe(
      false
    )
    expect(inspectMrz(text.replace(/6\n/, "7\n")).valid).toBe(false)
  })
  test("lọc chữ theo đúng vùng, không lấy dữ liệu từ vùng lân cận", () => {
    const words = [
      {
        text: "TRẦN",
        confidence: 91,
        row: 10,
        box: { x0: 31, y0: 10, x1: 48, y1: 20 },
      },
      {
        text: "AN",
        confidence: 89,
        row: 10,
        box: { x0: 50, y0: 10, x1: 70, y1: 20 },
      },
      {
        text: "QUỐC TỊCH",
        confidence: 99,
        row: 50,
        box: { x0: 1, y0: 50, x1: 20, y1: 70 },
      },
    ]
    const result = readField(words, { box: [0.3, 0, 1, 0.3] }, 100, 100)
    expect(result).toMatchObject({ value: "TRẦN AN", confidence: 90 })
    expect(readField(words, { box: [0, 0.8, 1, 1] }, 100, 100).value).toBe("")
  })
  test("số CCCD và ngày không tự bổ sung dữ liệu OCR thiếu", () => {
    const word = (text) => [
      { text, confidence: 95, row: 0, box: { x0: 0, y0: 0, x1: 50, y1: 20 } },
    ]
    expect(
      readField(
        word("01234567890"),
        { box: [0, 0, 1, 1], kind: "number" },
        100,
        100
      ).value
    ).toBe("")
    expect(
      readField(
        word("01/02/2000"),
        { box: [0, 0, 1, 1], kind: "date" },
        100,
        100
      ).value
    ).toBe("01/02/2000")
    expect(
      readField(word("01/02/20"), { box: [0, 0, 1, 1], kind: "date" }, 100, 100)
        .value
    ).toBe("")
  })
  test("tên bị OCR thêm chữ từ hoa văn không được ghi thêm vào mẫu", () => {
    expect(
      preferReading(
        { value: "TRAN VAN AN", confidence: 95 },
        { value: "TRẦN VĂN AN We A", confidence: 97 },
        "name"
      ).value
    ).toBe("TRẦN VĂN AN")
    expect(
      preferReading(
        { value: "TRẦN VĂN AN", confidence: 95 },
        { value: "TRẦN VĂN BA", confidence: 97 },
        "name"
      ).confidence
    ).toBeLessThan(80)
  })
  test("đọc định dạng blocks của Tesseract", () => {
    expect(
      ocrWords({
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    bbox: { y0: 10 },
                    words: [
                      {
                        text: "Việt",
                        confidence: 90,
                        bbox: { x0: 20, y0: 10, x1: 40, y1: 20 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })[0].text
    ).toBe("Việt")
    expect(ocrWords({})).toEqual([])
  })
  test("không xuất mẫu khi chưa có ảnh nguồn", async () => {
    await expect(renderTemplate("modern", "front", {})).rejects.toThrow(
      "Chưa có"
    )
  })
})
