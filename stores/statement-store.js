import { statementDefaults } from "../utils/constant.js"
import { createToolStore } from "./create-tool-store.js"
export function createStatementStore() {
  return createToolStore(
    {
      pages: [],
      editing: null,
      provider: "local",
      settings: { ...statementDefaults },
      notice: "",
      progress: "",
      exporting: false,
    },
    (set, get) => ({
      change: (update) => set((state) => ({ pages: update(state.pages) })),
      patch: (id, update) =>
        get().change((pages) =>
          pages.map((page) => (page.id === id ? update(page) : page))
        ),
      remove: (id) => {
        const page = get().pages.find((page) => page.id === id)
        if (page) URL.revokeObjectURL(page.url)
        set((state) => ({
          pages: state.pages.filter((page) => page.id !== id),
          editing: state.editing === id ? null : state.editing,
        }))
      },
      edit: (id, index, update) =>
        get().patch(id, (page) => {
          const paragraphs = page.paragraphs.map((item, i) =>
            i === index ? { ...item, ...update } : item
          )
          const ready = paragraphs.some((item) => item.text.trim())
          return {
            ...page,
            paragraphs,
            status: ready ? "ready" : "error",
            error: ready ? "" : "Hãy nhập nội dung hoặc xóa trang trống.",
          }
        }),
    })
  )
}
