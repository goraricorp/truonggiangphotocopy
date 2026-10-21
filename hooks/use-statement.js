import { useEffect, useRef } from "react"
import { createReader } from "@/lib/generator/ocr"
import { validateFile } from "@/lib/identify/model"
import { downloadBlob } from "@/lib/identify/export"
import {
  paragraph,
  preparePage,
  extractParagraphs,
} from "@/lib/statement/model"
import { createGeminiClient } from "@/lib/gemini/client"
import { makeWord } from "@/lib/statement/export"
import { createStatementStore } from "@/stores/statement-store"
import { useToolStore } from "./use-tool-store"
import { useImagePaste } from "./use-image-paste"

export function useStatement() {
  const [state, store] = useToolStore(createStatementStore)
  const { pages, setNotice, setProgress, setExporting, change, patch } = state
  const reader = useRef(null),
    gemini = useRef(null),
    active = useRef(false),
    pumping = useRef(false),
    input = useRef(null)
  useEffect(() => {
    active.current = true
    gemini.current = createGeminiClient()
    reader.current = createReader((message) => {
      if (active.current) setProgress(message)
    })
    return () => {
      active.current = false
      reader.current?.dispose()
      gemini.current?.dispose()
      store.getState().pages.forEach((page) => URL.revokeObjectURL(page.url))
    }
  }, [store, setProgress])
  async function pump() {
    if (pumping.current || !active.current) return
    pumping.current = true
    try {
      while (active.current) {
        const page = store
          .getState()
          .pages.find((item) => item.status === "queued")
        if (!page) break
        patch(page.id, (item) => ({ ...item, status: "reading", error: "" }))
        try {
          const image = await preparePage(page.file)
          if (!active.current) break
          const result =
            page.provider === "gemini"
              ? await gemini.current.process(image, "statement")
              : await reader.current.recognize(image, false, "document")
          if (!active.current) break
          const paragraphs =
            page.provider === "gemini"
              ? result.paragraphs
              : extractParagraphs(result, image.width, image.height)
          // Deleted pages are never reinserted when a late OCR result arrives.
          patch(page.id, (item) => ({
            ...item,
            status: paragraphs.length ? "ready" : "error",
            paragraphs: paragraphs.length ? paragraphs : [paragraph()],
            confidence: result.confidence,
            warning: (result.warnings ?? []).join(" "),
            error: paragraphs.length
              ? ""
              : "Chưa đọc được chữ. Hãy nhập nội dung, đọc lại ảnh rõ hơn hoặc xóa trang này.",
          }))
          image.width = 1
          image.height = 1
        } catch (error) {
          if (active.current)
            patch(page.id, (item) => ({
              ...item,
              status: "error",
              paragraphs: item.paragraphs.length
                ? item.paragraphs
                : [paragraph()],
              error: error.message || "Không đọc được ảnh trang văn bản.",
            }))
        }
      }
    } finally {
      pumping.current = false
      if (active.current) setProgress("")
    }
  }
  function append(files) {
    const added = []
    let rejected = 0
    for (const file of files) {
      try {
        validateFile(file)
        added.push({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
          status: "queued",
          provider: store.getState().provider,
          paragraphs: [],
          error: "",
        })
      } catch {
        rejected++
      }
    }
    if (added.length) {
      change((list) => [...list, ...added])
      void pump()
    }
    setNotice(
      rejected
        ? `Đã bỏ qua ${rejected} ảnh không hợp lệ. Chỉ nhận JPEG, PNG, WebP, tối đa 20 MB mỗi ảnh.`
        : ""
    )
  }
  async function exportWord() {
    if (store.getState().exporting) return
    setNotice("")
    setExporting(true)
    const snapshot = store.getState().pages
    try {
      const blob = await makeWord(snapshot, store.getState().settings)
      if (!active.current) return
      if (store.getState().pages !== snapshot)
        throw new Error(
          "Danh sách hoặc nội dung trang đã thay đổi. Hãy xuất lại để lấy đủ nội dung mới nhất."
        )
      downloadBlob(blob, "van-ban-danh-may.docx")
    } catch (error) {
      if (active.current) setNotice(error.message)
    } finally {
      if (active.current) setExporting(false)
    }
  }
  useImagePaste(append, true)
  const pending = pages.filter((page) =>
    ["queued", "reading"].includes(page.status)
  ).length
  const ready =
    pages.length > 0 &&
    pages.every(
      (page) =>
        page.status === "ready" &&
        page.paragraphs.some((item) => item.text.trim())
    )

  return { ...state, pending, ready, input, append, pump, exportWord }
}
