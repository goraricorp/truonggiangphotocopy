import { afterEach, expect, test, vi } from "vitest"
import { createIdentifyStore, newCard } from "../stores/identify-store.js"
import { createGeneratorStore } from "../stores/generator-store.js"
import { createStatementStore } from "../stores/statement-store.js"
import { paragraph } from "../lib/statement/model.js"
afterEach(() => vi.restoreAllMocks())

test("store độc lập, setter ổn định và cập nhật hàm đọc đúng state mới nhất", () => {
  const a = createIdentifyStore(),
    b = createIdentifyStore(),
    setter = a.getState().setPreview
  setter((value) => !value)
  setter((value) => !value)
  setter((value) => !value)
  expect(a.getState().preview).toBe(true)
  expect(b.getState().preview).toBe(false)
  expect(a.getState().setPreview).toBe(setter)
  a.getState().setGap(25)
  expect(b.getState().gap).toBe(56)
})
test("kết quả cũ không được ghi đè ảnh đã thay token hoặc trang đã xóa", () => {
  const store = createIdentifyStore(),
    id = store.getState().cards[0].id
  store.getState().replaceCards((cards) =>
    cards.map((card) => ({
      ...card,
      front: { token: "new", status: "processing" },
    }))
  )
  store
    .getState()
    .patch(id, "front", "old", () => ({ token: "old", status: "ready" }))
  expect(store.getState().cards[0].front.token).toBe("new")
  store
    .getState()
    .patch(id, "front", "new", (value) => ({ ...value, status: "ready" }))
  expect(store.getState().cards[0].front.status).toBe("ready")
  store.getState().replaceCards(() => [])
  store.getState().patch(id, "front", "new", () => ({ token: "new" }))
  expect(store.getState().cards).toEqual([])
})
test("đổi thứ tự giữ ảnh và không tạo item ngoài danh sách", () => {
  const store = createIdentifyStore(),
    extra = newCard()
  store.getState().replaceCards((cards) => [...cards, extra])
  const before = store.getState().cards
  store.getState().reorder(0, 1)
  expect(store.getState().cards[0]).toBe(extra)
  expect(before[1]).toBe(extra)
  store.getState().reorder(0, -1)
  expect(store.getState().cards).toHaveLength(2)
})
test("chọn ô cập nhật ngay để nhận ảnh dán kế tiếp", () => {
  const store = createIdentifyStore(),
    id = store.getState().cards[0].id
  store.getState().select(id, "back")
  expect(store.getState().selected).toEqual({ id, side: "back" })
  const generator = createGeneratorStore()
  generator.getState().select("back")
  expect(generator.getState().selected).toBe("back")
  generator.getState().setBusy(true)
  expect(generator.getState().busy).toBe(true)
})
test("sửa ảnh generator xóa kết quả mẫu cũ và giải phóng URL một lần", () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const store = createGeneratorStore(),
    front = { crop: new Blob(["front"]) }
  store
    .getState()
    .setOutputs([{ url: "blob:output-front" }, { url: "blob:output-back" }])
  store.getState().update("front", front)
  expect(store.getState().images.front).toBe(front)
  expect(store.getState().outputs).toBeNull()
  expect(revoke).toHaveBeenCalledTimes(2)
  store.getState().clearOutputs()
  expect(revoke).toHaveBeenCalledTimes(2)
})
test("văn bản giữ thứ tự thêm và không đưa lại trang đã xóa bởi kết quả chậm", () => {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const store = createStatementStore()
  store
    .getState()
    .change(() => [
      { id: "1", url: "blob:1", status: "reading", paragraphs: [] },
    ])
  store
    .getState()
    .change((pages) => [
      ...pages,
      { id: "2", url: "blob:2", status: "queued", paragraphs: [] },
    ])
  store.getState().remove("1")
  store.getState().patch("1", (page) => ({ ...page, status: "ready" }))
  expect(store.getState().pages.map((page) => page.id)).toEqual(["2"])
})
test("sửa nội dung cập nhật khả năng xuất, xóa trang dọn vùng chỉnh sửa", () => {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const store = createStatementStore()
  store
    .getState()
    .change(() => [
      { id: "1", url: "blob:1", status: "error", paragraphs: [paragraph()] },
    ])
  store.getState().edit("1", 0, { text: "Đã đối chiếu", bold: true })
  expect(store.getState().pages[0]).toMatchObject({
    status: "ready",
    error: "",
  })
  store.getState().edit("1", 0, { text: " " })
  expect(store.getState().pages[0].status).toBe("error")
  store.getState().setEditing("1")
  store.getState().remove("1")
  expect(store.getState().editing).toBeNull()
})

test("giá trị không đổi không phát thông báo render lại", () => {
  const store = createStatementStore(),
    listener = vi.fn()
  const unsubscribe = store.subscribe(listener)
  store.getState().setProgress("")
  expect(listener).not.toHaveBeenCalled()
  store.getState().setProgress("Đang xử lý")
  store.getState().setProgress("Đang xử lý")
  expect(listener).toHaveBeenCalledTimes(1)
  unsubscribe()
})
