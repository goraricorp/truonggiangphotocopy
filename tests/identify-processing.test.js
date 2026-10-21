import { afterEach, expect, test, vi } from "vitest"
import { createProcessor } from "../lib/identify/processing.js"

const workers = []
class WorkerMock {
  constructor() {
    this.messages = []
    this.terminate = vi.fn()
    workers.push(this)
  }
  postMessage(message) {
    this.messages.push(message)
  }
  reply(result, error) {
    this.onmessage({ data: { id: this.messages.at(-1).id, result, error } })
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
afterEach(() => {
  workers.length = 0
  vi.unstubAllGlobals()
})

test("nạp trước một lần, ảnh chờ khởi tạo và tái sử dụng worker", async () => {
  vi.stubGlobal("Worker", WorkerMock)
  const engine = createProcessor(),
    ready = engine.warmup()
  expect(engine.warmup()).toBe(ready)
  const processing = engine.process(new Blob(["image"]), { side: "front" })
  await tick()
  expect(workers).toHaveLength(1)
  expect(workers[0].messages).toHaveLength(1)
  expect(workers[0].messages[0].type).toBe("warmup")
  workers[0].reply({ ready: true })
  await expect(ready).resolves.toEqual({ ready: true })
  await tick()
  expect(workers[0].messages[1].side).toBe("front")
  workers[0].reply({ detected: true })
  await expect(processing).resolves.toEqual({ detected: true })
  engine.dispose()
  expect(workers[0].terminate).toHaveBeenCalled()
})
test("nạp trước lỗi không khóa hàng đợi xử lý", async () => {
  vi.stubGlobal("Worker", WorkerMock)
  const engine = createProcessor(),
    ready = engine.warmup()
  const rejected = expect(ready).rejects.toThrow("Không tải")
  await tick()
  workers[0].reply(undefined, "Không tải được")
  await rejected
  const processing = engine.process(new Blob(["image"]))
  await tick()
  workers[0].reply({ detected: true })
  await expect(processing).resolves.toEqual({ detected: true })
  engine.dispose()
})
test("rời trang khi đang chuẩn bị sẽ hủy và giải phóng worker", async () => {
  vi.stubGlobal("Worker", WorkerMock)
  const engine = createProcessor(),
    ready = engine.warmup()
  const rejected = expect(ready).rejects.toMatchObject({ name: "AbortError" })
  await tick()
  engine.dispose()
  await rejected
  expect(workers[0].terminate).toHaveBeenCalled()
  await expect(engine.process(new Blob())).rejects.toMatchObject({
    name: "AbortError",
  })
})
