import { getSecret } from "astro:env/server"

// Server only. The Astro virtual module prevents importing this into a client bundle.
export function readEnvironment(read = getSecret) {
  const integer = (name, fallback, minimum, maximum) => {
    const raw = read(name)
    const value = raw === undefined || raw === "" ? fallback : Number(raw)
    if (!Number.isInteger(value) || value < minimum || value > maximum)
      throw new Error(
        `Biến ${name} phải là số nguyên từ ${minimum} đến ${maximum}.`
      )
    return value
  }
  const model = (read("GEMINI_MODEL") || "gemini-3.8-flash").trim()
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    throw new Error("Biến GEMINI_MODEL không hợp lệ.")
  return Object.freeze({
    geminiApiKey: (read("GEMINI_API_KEY") || "").trim(),
    geminiModel: model,
    geminiTimeoutMs: integer("GEMINI_TIMEOUT_MS", 90000, 1000, 180000),
    geminiMaxImageBytes:
      integer("GEMINI_MAX_IMAGE_MB", 10, 1, 14) * 1024 * 1024,
    geminiMaxConcurrentRequests: integer(
      "GEMINI_MAX_CONCURRENT_REQUESTS",
      2,
      1,
      10
    ),
  })
}
export const environment = {
  get gemini() {
    return readEnvironment()
  },
}
