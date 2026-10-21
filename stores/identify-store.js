import { createToolStore } from "./create-tool-store.js"
export const cardSides = ["front", "back"]
export const newCard = (id = crypto.randomUUID()) => ({
  id,
  included: true,
  front: null,
  back: null,
})
export function createIdentifyStore(initialId) {
  return createToolStore(
    {
      cards: [newCard(initialId)],
      selected: null,
      notice: "",
      preparing: true,
      editor: null,
      replacement: null,
      pasteFiles: [],
      pasteTarget: "",
      format: "pdf",
      dpi: 300,
      gap: 56,
      quality: 0.95,
      exporting: false,
      preview: false,
    },
    (set, get) => ({
      replaceCards: (update) =>
        set((state) => ({ cards: update(state.cards) })),
      patch: (id, side, token, update) =>
        get().replaceCards((cards) =>
          cards.map((card) =>
            card.id === id && card[side]?.token === token
              ? { ...card, [side]: update(card[side]) }
              : card
          )
        ),
      select: (id, side) => set({ selected: { id, side } }),
      reorder: (index, delta) =>
        get().replaceCards((cards) => {
          const target = index + delta
          if (
            index < 0 ||
            index >= cards.length ||
            target < 0 ||
            target >= cards.length
          )
            return cards
          const next = [...cards]
          ;[next[index], next[target]] = [next[target], next[index]]
          return next
        }),
    })
  )
}
