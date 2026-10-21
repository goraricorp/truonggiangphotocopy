import { useEffect, useEffectEvent } from "react"

export function useImagePaste(onFiles, acceptInEditable = false) {
  const receive = useEffectEvent(onFiles)
  useEffect(() => {
    const paste = (event) => {
      if (
        !acceptInEditable &&
        event.target instanceof Element &&
        event.target.closest("input,textarea,[contenteditable=true]")
      )
        return
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean)
      if (!files.length) return
      event.preventDefault()
      receive(files)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [acceptInEditable])
}
