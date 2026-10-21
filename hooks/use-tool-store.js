import { useState } from "react"
import { useStore } from "zustand"

export function useToolStore(createStore) {
  const [store] = useState(createStore)
  return [useStore(store), store]
}
