import { downloadBlob, fileName, makeDocument } from "@/lib/identify/export"
import {
  defaults,
  imageDimensionsSchema,
  readyCards,
  validateFile,
} from "@/lib/identify/model"
import { createProcessor } from "@/lib/identify/processing"
import { useEffect, useRef, useId } from "react"
import {
  createIdentifyStore,
  cardSides as sides,
} from "@/stores/identify-store"
import { revokeImageUrls as release } from "@/lib/identify/image-source"
import { useToolStore } from "./use-tool-store"
import { useImagePaste } from "./use-image-paste"
const loadEditor = () => import("@/components/identify/card-editor")

export function useIdentify() {
  const initialId = useId().replaceAll(":", "")
  const [state, store] = useToolStore(() => createIdentifyStore(initialId))
  const {
    cards,
    editor,
    setSelected,
    setNotice,
    setPreparing,
    setReplacement,
    setPasteFiles,
    setExporting,
    replaceCards,
    patch,
    select,
  } = state
  const processor = useRef(null),
    controllers = useRef(new Map()),
    mounted = useRef(true),
    confirmResolve = useRef(null)
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    const engine = createProcessor()
    processor.current = engine
    setPreparing(true)
    void engine
      .warmup()
      .then((result) => {
        if (!cancelled && result.warnings?.length)
          setNotice(result.warnings.join(" "))
      })
      .catch(() => {
        if (!cancelled)
          setNotice(
            "Chưa tải xong bộ xử lý ảnh. Hãy kiểm tra kết nối rồi thử xử lý lại."
          )
      })
      .finally(() => {
        if (!cancelled) setPreparing(false)
      })
    void loadEditor().catch(() => {})
    const tasks = controllers.current
    return () => {
      cancelled = true
      mounted.current = false
      tasks.forEach((c) => c.abort())
      engine.dispose()
      if (processor.current === engine) processor.current = null
      store
        .getState()
        .cards.forEach((c) => sides.forEach((side) => release(c[side])))
      confirmResolve.current?.(false)
    }
  }, [store, setNotice, setPreparing])
  useImagePaste((files) => {
    const { selected, cards } = store.getState()
    if (selected && cards.some((card) => card.id === selected.id)) {
      void upload(selected.id, selected.side, files[0])
      if (files.length > 1) setPasteFiles(files.slice(1))
    } else setPasteFiles(files)
  })
  function confirmReplace(label) {
    return new Promise((resolve) => {
      confirmResolve.current?.(false)
      confirmResolve.current = resolve
      setReplacement(label)
    })
  }
  function answerReplace(value) {
    confirmResolve.current?.(value)
    confirmResolve.current = null
    setReplacement(null)
  }
  async function run(id, side, options = {}) {
    const value = store.getState().cards.find((c) => c.id === id)?.[side]
    if (!value) return
    const key = `${id}:${side}`
    controllers.current.get(key)?.abort()
    const controller = new AbortController()
    controllers.current.set(key, controller)
    patch(id, side, value.token, (old) => ({
      ...old,
      status: "processing",
      error: "",
    }))
    try {
      processor.current ??= createProcessor()
      const result = await processor.current.process(
        value.file,
        { ...options, side },
        controller.signal
      )
      if (controller.signal.aborted || !mounted.current) return
      patch(id, side, value.token, (old) => {
        if (old.outputUrl) URL.revokeObjectURL(old.outputUrl)
        return {
          ...old,
          result: result.blob ?? null,
          outputUrl: result.blob ? URL.createObjectURL(result.blob) : null,
          status: result.detected ? "ready" : "review",
          points: result.points,
          settings: result.settings ?? defaults,
          warnings: result.warnings,
          width: result.width,
          height: result.height,
          error: "",
        }
      })
      if (!result.detected && options.points)
        throw new Error("Không thể áp dụng bốn góc đã chọn.")
    } catch (error) {
      if (controller.signal.aborted) {
        patch(id, side, value.token, (old) => ({
          ...old,
          status: old.result ? "ready" : "review",
          error: "Đã hủy xử lý; ảnh gốc được giữ lại.",
        }))
        return
      }
      patch(id, side, value.token, (old) => ({
        ...old,
        status: "review",
        error: error.message,
      }))
      throw error
    } finally {
      if (controllers.current.get(key) === controller)
        controllers.current.delete(key)
    }
  }
  async function upload(id, side, file) {
    try {
      validateFile(file)
      const image = await createImageBitmap(file, {
        imageOrientation: "from-image",
      }).catch(() => {
        throw new Error(
          "Không giải mã được ảnh. Hãy chọn ảnh JPEG, PNG hoặc WebP khác."
        )
      })
      const valid = imageDimensionsSchema.safeParse({
        width: image.width,
        height: image.height,
      }).success
      image.close()
      if (!valid)
        throw new Error(
          "Ảnh quá nhỏ hoặc vượt 60 triệu điểm ảnh. Hãy chọn ảnh khác."
        )
      const old = store.getState().cards.find((c) => c.id === id)?.[side]
      if (
        old &&
        !(await confirmReplace(
          `Thay ảnh ${side === "front" ? "mặt trước" : "mặt sau"}?`
        ))
      )
        return
      if (!store.getState().cards.some((c) => c.id === id)) return
      controllers.current.get(`${id}:${side}`)?.abort()
      release(old)
      const value = {
        file,
        sourceUrl: URL.createObjectURL(file),
        outputUrl: null,
        result: null,
        token: crypto.randomUUID(),
        status: "queued",
        warnings: [],
        settings: { ...defaults },
      }
      replaceCards((list) =>
        list.map((c) => (c.id === id ? { ...c, [side]: value } : c))
      )
      select(id, side)
      await run(id, side)
    } catch (error) {
      if (mounted.current)
        setNotice(
          error.message ||
            "Không giải mã được ảnh. Hãy thử JPEG, PNG hoặc WebP khác."
        )
    }
  }
  function removeSide(id, side) {
    controllers.current.get(`${id}:${side}`)?.abort()
    const value = store.getState().cards.find((c) => c.id === id)?.[side]
    release(value)
    replaceCards((list) =>
      list.map((c) => (c.id === id ? { ...c, [side]: null } : c))
    )
  }
  function removeCard(id) {
    sides.forEach((side) => {
      controllers.current.get(`${id}:${side}`)?.abort()
      release(store.getState().cards.find((c) => c.id === id)?.[side])
    })
    replaceCards((list) => list.filter((c) => c.id !== id))
    if (store.getState().selected?.id === id) {
      setSelected(null)
    }
  }
  function rerunCard(card) {
    for (const side of sides)
      if (card[side]) void run(card.id, side).catch((e) => setNotice(e.message))
  }
  async function exportAll() {
    const { format, dpi, gap, quality, exporting } = store.getState()
    if (exporting) return
    setNotice("")
    try {
      readyCards(store.getState().cards)
      setExporting(true)
      const blob = await makeDocument(store.getState().cards, {
        format,
        dpi,
        gap,
        quality,
      })
      downloadBlob(blob, fileName(format))
    } catch (e) {
      setNotice(e?.issues ? "Tùy chọn xuất không hợp lệ." : e.message)
    } finally {
      setExporting(false)
    }
  }
  const busy = cards.some((c) =>
      sides.some((side) => c[side]?.status === "processing")
    ),
    editorCard = editor && cards.find((c) => c.id === editor.id),
    editorValue = editorCard?.[editor?.side]

  return {
    ...state,
    busy,
    editorValue,
    controllers,
    removeCard,
    removeSide,
    upload,
    run,
    rerunCard,
    answerReplace,
    exportAll,
  }
}
