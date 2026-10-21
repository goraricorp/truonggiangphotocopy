import { expect, test, vi } from "vitest"
import { bindNavigationProgress } from "../lib/navigation-progress.js"
function setup(shallowRouting = true) {
  const events = new EventTarget(),
    start = vi.fn(),
    stop = vi.fn()
  let current = "https://app.test/"
  const cleanup = bindNavigationProgress(
    events,
    { start, stop, shallowRouting },
    () => current
  )
  const begin = (to, controller = new AbortController()) => {
    const event = new Event("astro:before-preparation")
    Object.assign(event, {
      from: new URL(current),
      to: new URL(to, current),
      signal: controller.signal,
    })
    events.dispatchEvent(event)
    return controller
  }
  const finish = (url) => {
    current = new URL(url, current).href
    events.dispatchEvent(new Event("astro:page-load"))
  }
  return { start, stop, begin, finish, cleanup }
}
test("bắt đầu khi chuyển path và kết thúc khi trang đã tải", () => {
  const app = setup()
  app.begin("/identify")
  expect(app.start).toHaveBeenCalledTimes(1)
  app.finish("/identify")
  expect(app.stop).toHaveBeenCalledTimes(1)
  app.cleanup()
})
test("shallowRouting bỏ qua URL hiện tại, query và hash cùng trang", () => {
  const app = setup()
  app.begin("/")
  app.begin("/?sort=1")
  app.begin("/#footer")
  expect(app.start).not.toHaveBeenCalled()
  app.cleanup()
})
test("có thể theo dõi query khi không dùng shallowRouting", () => {
  const app = setup(false)
  app.begin("/?sort=1")
  app.finish("/")
  expect(app.stop).not.toHaveBeenCalled()
  app.finish("/?sort=1")
  expect(app.stop).toHaveBeenCalledTimes(1)
  app.cleanup()
})
test("hủy yêu cầu cũ hoặc page-load cũ không tắt progress của trang mới", async () => {
  const app = setup(),
    old = app.begin("/identify")
  app.begin("/generator")
  old.abort()
  app.finish("/identify")
  await Promise.resolve()
  expect(app.stop).not.toHaveBeenCalled()
  app.finish("/generator")
  expect(app.stop).toHaveBeenCalledTimes(1)
  app.cleanup()
})
test("hủy điều hướng cuối cùng kết thúc thanh progress", async () => {
  const app = setup()
  app.begin("/identify").abort()
  await Promise.resolve()
  expect(app.stop).toHaveBeenCalledTimes(1)
  app.cleanup()
})
test("tháo component dọn listener và dừng progress", () => {
  const app = setup()
  app.cleanup()
  app.begin("/identify")
  expect(app.start).not.toHaveBeenCalled()
  expect(app.stop).toHaveBeenCalledTimes(1)
})
