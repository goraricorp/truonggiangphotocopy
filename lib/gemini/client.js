export function createGeminiClient() {
  const controller = new AbortController()
  return {
    async process(image, task = "statement", side = "front") {
      const blob =
        image instanceof Blob
          ? image
          : await new Promise((resolve) => image.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("Không chuẩn bị được ảnh để gửi Gemini.")
      let response
      try {
        response = await fetch(
          `/api/gemini?task=${encodeURIComponent(task)}&side=${encodeURIComponent(side)}`,
          {
            method: "POST",
            headers: { "Content-Type": blob.type },
            body: blob,
            signal: controller.signal,
            credentials: "same-origin",
          }
        )
      } catch (error) {
        if (error.name === "AbortError") throw error
        throw new Error("Không kết nối được máy chủ xử lý Gemini.", {
          cause: error,
        })
      }
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(
          "Máy chủ chưa hỗ trợ API Gemini hoặc trả dữ liệu không hợp lệ."
        )
      }
      if (!response.ok)
        throw new Error(data.error || "Không xử lý được ảnh bằng Gemini.")
      return data
    },
    dispose() {
      controller.abort()
    },
  }
}
