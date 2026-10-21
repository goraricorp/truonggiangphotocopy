import { createToolStore } from "./create-tool-store.js"
export function createGeneratorStore() {
  return createToolStore(
    {
      images: { front: null, back: null },
      selected: null,
      override: "auto",
      busy: false,
      progress: "",
      notice: "",
      editor: null,
      outputs: null,
      gap: 56,
    },
    (set, get) => ({
      select: (selected) => set({ selected }),
      clearOutputs: () => {
        get().outputs?.forEach((item) => URL.revokeObjectURL(item.url))
        set({ outputs: null })
      },
      update: (side, value) => {
        get().outputs?.forEach((item) => URL.revokeObjectURL(item.url))
        set((state) => ({
          images: { ...state.images, [side]: value },
          outputs: null,
        }))
      },
    })
  )
}
