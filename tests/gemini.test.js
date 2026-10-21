import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Buffer } from "node:buffer"
import { readEnvironment } from "../utils/environment.js"
import { GET, POST } from "../pages/api/gemini.js"
import { analyzeImage, readImageBody } from "../lib/gemini/server.js"
import { jsonSchema } from "../lib/gemini/schema.js"
import { createGeminiClient } from "../lib/gemini/client.js"
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
const parsed = {
  paragraphs: [
    {
      text: "Văn bản tiếng Việt",
      alignment: "center",
      bold: true,
      italic: false,
      type: "paragraph",
      indent: 0,
    },
  ],
  warnings: [],
}
const response = (result = parsed, finishReason = "STOP") =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason,
          content: { parts: [{ text: JSON.stringify(result) }] },
        },
      ],
    })
  )
const request = (headers = {}, body = png, query = "task=statement") =>
  new Request(`http://localhost/api/gemini?${query}`, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      origin: "http://localhost",
      ...headers,
    },
    body,
  })
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-private-key-never-client")
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash")
  vi.stubEnv("GEMINI_TIMEOUT_MS", "1000")
  vi.stubEnv("GEMINI_MAX_IMAGE_MB", "1")
  vi.stubEnv("GEMINI_MAX_CONCURRENT_REQUESTS", "1")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe("environment tập trung", () => {
  test("có mặc định, chỉ đọc các biến khai báo và không yêu cầu key để build", () => {
    const read = vi.fn(() => undefined),
      env = readEnvironment(read)
    expect(env.geminiApiKey).toBe("")
    expect(env.geminiModel).toBe("gemini-3.8-flash")
    expect(env.geminiMaxImageBytes).toBe(10 * 1024 * 1024)
    expect(read.mock.calls.map((call) => call[0])).toEqual([
      "GEMINI_MODEL",
      "GEMINI_API_KEY",
      "GEMINI_TIMEOUT_MS",
      "GEMINI_MAX_IMAGE_MB",
      "GEMINI_MAX_CONCURRENT_REQUESTS",
    ])
  })
  test("từ chối model chứa URL, số ngoài giới hạn và không in giá trị secret", () => {
    expect(() =>
      readEnvironment((name) =>
        name === "GEMINI_MODEL" ? "https://evil.example" : undefined
      )
    ).toThrow("GEMINI_MODEL")
    expect(() =>
      readEnvironment((name) =>
        name === "GEMINI_MAX_IMAGE_MB" ? "99" : undefined
      )
    ).toThrow("GEMINI_MAX_IMAGE_MB")
  })
})
describe("API ảnh Gemini phía server", () => {
  test("GET chỉ trả trạng thái và model, không trả key", async () => {
    const result = await GET().text()
    expect(result).toContain('"configured":true')
    expect(result).not.toContain("test-private-key")
  })
  test("key trống không gọi Google", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const result = await POST({ request: request() })
    expect(result.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })
  test("gửi ảnh inline, key chỉ ở header và trả cấu trúc đoạn", async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal("fetch", fetcher)
    const result = await POST({ request: request() })
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(parsed)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).not.toContain("test-private-key")
    expect(init.headers["x-goog-api-key"]).toBe("test-private-key-never-client")
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[0].inlineData.data).toBe(
      png.toString("base64")
    )
    expect(body.generationConfig.responseJsonSchema).toBeDefined()
    expect(result.headers.get("cache-control")).toBe("no-store")
  })
  test("chặn nguồn khác, task lạ, kiểu file giả và file quá lớn", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    expect(
      (await POST({ request: request({ origin: "https://other.example" }) }))
        .status
    ).toBe(403)
    expect(
      (await POST({ request: request({}, png, "task=command") })).status
    ).toBe(400)
    expect(
      (await POST({ request: request({ "content-type": "text/html" }) })).status
    ).toBe(415)
    expect(
      (await POST({ request: request({}, Buffer.from("fake png")) })).status
    ).toBe(400)
    expect(
      (await POST({ request: request({ "content-length": "2000000" }) })).status
    ).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })
  test("same-origin vẫn hoạt động khi adapter chuẩn hóa URL thành localhost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response())
    )
    const result = await POST({
      request: request({
        host: "127.0.0.1:5501",
        origin: "http://127.0.0.1:5501",
      }),
    })
    expect(result.status).toBe(200)
    expect((await POST({ request: request({ origin: "null" }) })).status).toBe(
      403
    )
  })
  test("giới hạn cả body stream khi không có content-length", async () => {
    const req = new Request("http://localhost/api/gemini", {
      method: "POST",
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(20))
          c.close()
        },
      }),
      duplex: "half",
    })
    await expect(readImageBody(req, 10)).rejects.toMatchObject({ status: 413 })
  })
  test("lỗi quyền/hạn mức không phản chiếu raw response hoặc key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("secret test-private-key-never-client", { status: 403 })
      )
    )
    const result = await POST({ request: request() })
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain("test-private-key")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 }))
    )
    expect((await POST({ request: request() })).status).toBe(429)
  })
  test("không dùng kết quả bị cắt, bị chặn hoặc sai schema", async () => {
    for (const upstream of [
      response(parsed, "MAX_TOKENS"),
      response(parsed, "SAFETY"),
      response({ paragraphs: "wrong" }),
      new Response("not JSON"),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => upstream)
      )
      expect((await POST({ request: request() })).status).toBe(502)
    }
  })
  test("timeout trả lỗi có thể đọc lại, không bỏ qua trang", async () => {
    await expect(
      analyzeImage({
        bytes: png,
        mimeType: "image/png",
        task: "statement",
        config: readEnvironment(),
        fetcher: (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(new Error("abort")), {
              once: true,
            })
          ),
      })
    ).rejects.toMatchObject({ status: 504 })
  })
  test("không cho quá số request chạy cùng lúc và giải phóng sau lỗi", async () => {
    let finish
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    )
    const first = POST({ request: request() })
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
    expect((await POST({ request: request() })).status).toBe(429)
    finish(new Response("error", { status: 500 }))
    await first
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response())
    )
    expect((await POST({ request: request() })).status).toBe(200)
  })
})
describe("client không cần API key", () => {
  test("gửi cùng origin và có thể hủy khi rời trang", async () => {
    const fetcher = vi.fn(async () => Response.json(parsed))
    vi.stubGlobal("fetch", fetcher)
    const client = createGeminiClient()
    expect(
      await client.process(new Blob([png], { type: "image/png" }))
    ).toEqual(parsed)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("/api/gemini?task=statement&side=front")
    expect(init.headers).toEqual({ "Content-Type": "image/png" })
    client.dispose()
    expect(init.signal.aborted).toBe(true)
  })
})

test("schema gửi Google dùng numeric enum thay cho const", () => {
  const schema = jsonSchema("statement")
  expect(schema.properties.paragraphs.items.properties.indent).toEqual({
    type: "integer",
    enum: [0, 10],
  })
  expect(JSON.stringify(schema)).not.toContain('"const":')
  expect(JSON.stringify(schema)).not.toContain('"maxLength":')
  expect(JSON.stringify(schema)).not.toContain('"maxItems":')
})
