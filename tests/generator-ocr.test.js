import { afterEach, describe, expect, test, vi } from "vitest"
import { createReader } from "../lib/generator/ocr.js"
const { createWorker, recognize, setParameters, terminate } = vi.hoisted(
  () => ({
    createWorker: vi.fn(),
    recognize: vi.fn(),
    setParameters: vi.fn(),
    terminate: vi.fn(),
  })
)
vi.mock("tesseract.js", () => ({ createWorker }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
function setup() {
  vi.stubGlobal("location", { origin: "https://photocopy.example" })
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([31, 139, 0])))
  )
  createWorker.mockResolvedValue({ recognize, setParameters, terminate })
  recognize.mockResolvedValue({ data: { text: "THỬ NGHIỆM", confidence: 90 } })
  setParameters.mockResolvedValue(undefined)
}
describe("vòng đời OCR cục bộ", () => {
  test("tái sử dụng worker, xếp hàng và không lẫn chế độ MRZ với chữ Việt", async () => {
    setup()
    const reader = createReader()
    await Promise.all([
      reader.recognize("front"),
      reader.recognize("mrz", true),
      reader.recognize("back"),
    ])
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(createWorker.mock.calls[0][0]).toBe("vie+eng")
    expect(recognize.mock.calls.map((call) => call[0])).toEqual([
      "front",
      "mrz",
      "back",
    ])
    expect(
      setParameters.mock.calls.map((call) => call[0].tessedit_char_whitelist)
    ).toEqual(["", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", ""])
    const options = createWorker.mock.calls[0][2]
    expect(options.workerPath).toBe(
      "https://photocopy.example/ocr/worker.min.js"
    )
    expect(options.cacheMethod).toBe("none")
    reader.dispose()
    expect(terminate).toHaveBeenCalledTimes(1)
    await expect(reader.recognize("again")).rejects.toMatchObject({
      name: "AbortError",
    })
  })
  test("tải mô hình lỗi không treo hàng đợi, lần thử sau có thể tiếp tục", async () => {
    setup()
    fetch.mockResolvedValueOnce(new Response("", { status: 404 }))
    const reader = createReader()
    await expect(reader.recognize("front")).rejects.toThrow("Không tải được")
    expect(createWorker).not.toHaveBeenCalled()
    await expect(reader.recognize("retry")).resolves.toMatchObject({
      text: "THỬ NGHIỆM",
    })
    reader.dispose()
  })
  test("lỗi khởi tạo được chuyển thành thông báo thay vì chờ vô hạn", async () => {
    setup()
    createWorker.mockImplementation((_languages, _mode, options) => {
      options.errorHandler("load failed")
      return new Promise(() => {})
    })
    const reader = createReader()
    await expect(reader.recognize("front")).rejects.toThrow(
      "Không khởi tạo được"
    )
    reader.dispose()
  })
})
