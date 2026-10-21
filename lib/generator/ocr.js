import { ocrWords } from "./model.js"

export function createReader(progress = () => {}) {
  let worker,
    pending,
    disposed = false,
    tail = Promise.resolve()
  const controller = new AbortController()
  async function load() {
    if (disposed) throw new DOMException("Đã hủy đọc ảnh.", "AbortError")
    pending ??= (async () => {
      const { createWorker } = await import("tesseract.js")
      // Fetch first so a failed language request rejects normally rather than
      // leaving the library's initialization promise pending indefinitely.
      const languages = await Promise.all(
        ["vie", "eng"].map(async (code) => {
          const response = await fetch(`/ocr/${code}.traineddata.gz`, {
            signal: controller.signal,
          })
          if (!response.ok)
            throw new Error("Không tải được dữ liệu đọc chữ. Hãy thử lại.")
          await response.arrayBuffer()
          return code
        })
      )
      let startupReject
      const startupError = new Promise((_, reject) => {
        startupReject = reject
      })
      const creation = createWorker(languages.join("+"), 1, {
        workerPath: new URL("/ocr/worker.min.js", location.origin).href,
        corePath: new URL("/ocr", location.origin).href,
        langPath: new URL("/ocr", location.origin).href,
        workerBlobURL: false,
        cacheMethod: "none",
        errorHandler: () =>
          startupReject(
            new Error("Không khởi tạo được bộ đọc chữ. Hãy thử lại.")
          ),
        logger: (message) =>
          progress(
            message.status === "recognizing text"
              ? `Đang đọc chữ: ${Math.round(message.progress * 100)}%`
              : "Đang nạp bộ đọc tiếng Việt…"
          ),
      })
      const created = await Promise.race([creation, startupError])
      if (disposed) {
        await created.terminate()
        throw new DOMException("Đã hủy đọc ảnh.", "AbortError")
      }
      worker = created
      return worker
    })().catch((error) => {
      pending = null
      throw error instanceof Error
        ? error
        : new Error("Không đọc được chữ. Hãy thử lại.")
    })
    return pending
  }
  return {
    recognize(image, mrz = false, mode = "page") {
      const job = tail.then(async () => {
        const current = await load()
        await current.setParameters({
          tessedit_pageseg_mode:
            mode === "document"
              ? "3"
              : mrz || mode === "block"
                ? "6"
                : mode === "line"
                  ? "7"
                  : "11",
          tessedit_char_whitelist: mrz
            ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
            : "",
          user_defined_dpi: "300",
        })
        const { data } = await current.recognize(
          image,
          {},
          { text: true, blocks: !mrz }
        )
        return {
          text: data.text,
          confidence: data.confidence,
          words: ocrWords(data),
          blocks: data.blocks ?? [],
        }
      })
      tail = job.catch(() => {})
      return job
    },
    dispose() {
      disposed = true
      controller.abort()
      worker?.terminate()
      worker = null
    },
  }
}
