import { environment } from "../../utils/environment.js"
import {
  GeminiError,
  readImageBody,
  isImage,
  analyzeImage,
} from "../../lib/gemini/server.js"
export const prerender = false
let inFlight = 0
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
export function GET() {
  try {
    const config = environment.gemini
    return json({
      configured: !!config.geminiApiKey,
      model: config.geminiModel,
      maxImageBytes: config.geminiMaxImageBytes,
    })
  } catch {
    return json({ error: "Cấu hình Gemini trên máy chủ chưa hợp lệ." }, 503)
  }
}
export async function POST({ request }) {
  let acquired = false
  try {
    const origin = request.headers.get("origin")
    if (origin) {
      let sameOrigin = false
      try {
        const source = new URL(origin)
        const host = request.headers.get("host") ?? new URL(request.url).host
        sameOrigin =
          ["http:", "https:"].includes(source.protocol) &&
          source.origin === origin &&
          source.host.toLowerCase() === host.toLowerCase()
      } catch {
        /* Null/malformed origins are not accepted. */
      }
      if (!sameOrigin)
        throw new GeminiError("Yêu cầu không cùng nguồn ứng dụng.", 403)
    }
    const config = environment.gemini
    if (!config.geminiApiKey)
      throw new GeminiError(
        "Máy chủ chưa cấu hình Gemini. Hãy dùng OCR trên thiết bị hoặc thêm GEMINI_API_KEY.",
        503
      )
    const url = new URL(request.url),
      task = url.searchParams.get("task") ?? "statement",
      side = url.searchParams.get("side") ?? "front"
    if (
      !["statement", "identity"].includes(task) ||
      !["front", "back"].includes(side)
    )
      throw new GeminiError("Chức năng xử lý không hợp lệ.", 400)
    if (inFlight >= config.geminiMaxConcurrentRequests)
      throw new GeminiError(
        "Máy chủ đang xử lý ảnh khác bằng Gemini. Hãy đợi và thử lại.",
        429
      )
    inFlight++
    acquired = true
    const mimeType = (request.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType))
      throw new GeminiError("Chỉ nhận JPEG, PNG hoặc WebP.", 415)
    const bytes = await readImageBody(request, config.geminiMaxImageBytes)
    if (!isImage(bytes, mimeType))
      throw new GeminiError("Dữ liệu ảnh không đúng định dạng.", 400)
    return json(
      await analyzeImage({
        bytes,
        mimeType,
        task,
        side,
        config,
        signal: request.signal,
      })
    )
  } catch (error) {
    return json(
      {
        error:
          error instanceof GeminiError
            ? error.message
            : "Không xử lý được yêu cầu Gemini. Hãy kiểm tra cấu hình máy chủ.",
      },
      error instanceof GeminiError ? error.status : 500
    )
  } finally {
    if (acquired) inFlight--
  }
}
