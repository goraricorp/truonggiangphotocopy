import { createStore } from "zustand/vanilla"

// Stable setters accept either a value or an updater, matching React's API.
// Each tool creates its own instance; files are never serialized or persisted.
export function createToolStore(initial, actions = () => ({})) {
  return createStore((set, get) => ({
    ...initial,
    ...Object.fromEntries(
      Object.keys(initial).map((key) => [
        `set${key[0].toUpperCase()}${key.slice(1)}`,
        (value) =>
          set((state) => {
            const next = typeof value === "function" ? value(state[key]) : value
            return Object.is(next, state[key]) ? state : { [key]: next }
          }),
      ])
    ),
    ...actions(set, get),
  }))
}
