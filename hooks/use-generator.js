import { createGeminiClient } from "@/lib/gemini/client"
import { detectVariant, resolveVariant } from "@/lib/generator/model"
import { createReader } from "@/lib/generator/ocr"
import {
  extractFields,
  mrzImage,
  readFields,
  renderTemplate,
} from "@/lib/generator/render"
import { templates } from "@/lib/generator/templates"
import { downloadBlob, makeDocument } from "@/lib/identify/export"
import { defaults, fullCorners, validateFile } from "@/lib/identify/model"
import { createProcessor } from "@/lib/identify/processing"
import { useEffect, useRef } from "react"
import { createGeneratorStore } from "@/stores/generator-store"
import { revokeImageUrls as revoke } from "@/lib/identify/image-source"
import { useToolStore } from "./use-tool-store"
import { useImagePaste } from "./use-image-paste"
const sides = ["front", "back"]

export function useGenerator() {
  const [state, store] = useToolStore(createGeneratorStore)
  const {
    images,
    override,
    setBusy,
    setProgress,
    setNotice,
    setOutputs,
    setOverride,
    clearOutputs,
    update,
  } = state
  const processor = useRef(null),
    reader = useRef(null),
    gemini = useRef(null),
    alive = useRef(false)
  useEffect(() => {
    alive.current = true
    processor.current = createProcessor()
    gemini.current = createGeminiClient()
    reader.current = createReader((message) => {
      if (alive.current) setProgress(message)
    })
    return () => {
      alive.current = false
      processor.current?.dispose()
      reader.current?.dispose()
      gemini.current?.dispose()
      sides.forEach((side) => revoke(store.getState().images[side]))
      store.getState().outputs?.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [store, setProgress])
  useImagePaste((files) => {
    if (store.getState().busy || store.getState().editor) {
      setNotice(
        "Hãy hoàn tất xử lý hoặc đóng chỉnh sửa trước khi dán ảnh khác."
      )
      return
    }
    const side = store.getState().selected
    if (!side) {
      setNotice(
        "Hãy chọn ô mặt trước hoặc mặt sau rồi dán ảnh bằng Ctrl/Cmd+V."
      )
      return
    }
    void run(side, files[0])
    if (files.length > 1)
      setNotice("Đã nhận ảnh đầu tiên. Hãy dán từng ảnh vào mặt thẻ tương ứng.")
  })
  let variant = null,
    variantError = ""
  try {
    variant = resolveVariant(
      images.front?.variant,
      images.back?.variant,
      override
    )
  } catch (error) {
    variantError = error.message
  }
  function remove(side) {
    revoke(store.getState().images[side])
    update(side, null)
  }
  async function readCrop(side, value, result) {
    const updated = {
      ...value,
      crop: result.blob,
      result: result.blob,
      points: result.points ?? fullCorners(),
      settings: result.settings ?? defaults,
      width: result.width,
      height: result.height,
      warnings: result.warnings ?? [],
      status: "ready",
      cues: result.layoutCues,
      fields: {},
      ocr: null,
      ocrSource: "local",
      mrz: "",
    }
    if (!result.detected) {
      updated.status = "review"
      updated.error = "Chưa cắt được thẻ. Hãy mở chỉnh sửa và đặt lại bốn góc."
      update(side, updated)
      return
    }
    updated.outputUrl = URL.createObjectURL(result.blob)
    try {
      const ocr = await reader.current.recognize(result.blob)
      if (!alive.current) {
        URL.revokeObjectURL(updated.outputUrl)
        return
      }
      updated.ocr = ocr
      updated.variant = detectVariant(ocr.text, side, result.layoutCues)
      const chosen = resolveVariant(
        side === "front"
          ? updated.variant
          : store.getState().images.front?.variant,
        side === "back"
          ? updated.variant
          : store.getState().images.back?.variant,
        override
      )
      if (chosen) {
        updated.fields = await readFields(
          reader.current,
          ocr,
          chosen,
          side,
          result.blob
        )
        updated.fieldsVariant = chosen
        const otherSide = side === "front" ? "back" : "front"
        const other = store.getState().images[otherSide]
        if (other?.ocr && other.fieldsVariant !== chosen) {
          const fields = await readFields(
            reader.current,
            other.ocr,
            chosen,
            otherSide,
            other.crop
          )
          if (alive.current)
            update(otherSide, { ...other, fields, fieldsVariant: chosen })
        }
      }
      if (side === "back") {
        const crop = await mrzImage(
          result.blob,
          templates[chosen ?? "modern"].back.sourceMrz
        )
        const mrz = await reader.current.recognize(crop, true)
        updated.mrz = mrz.text.trim()
      }
    } catch (error) {
      if (!alive.current) {
        URL.revokeObjectURL(updated.outputUrl)
        return
      }
      updated.error = `Đã cắt ảnh nhưng chưa đọc đủ chữ: ${error.message}. Các vùng chưa đọc rõ được giữ từ ảnh gốc.`
    }
    if (alive.current) update(side, updated)
    else URL.revokeObjectURL(updated.outputUrl)
  }
  async function run(side, file, options = {}) {
    if (store.getState().busy) return

    setBusy(true)
    setNotice("")
    setProgress("Đang cắt và nắn phối cảnh…")
    let value = store.getState().images[side]
    try {
      validateFile(file)
      if (!value || value.file !== file) {
        revoke(value)
        value = {
          file,
          sourceUrl: URL.createObjectURL(file),
          points: fullCorners(),
          status: "processing",
          fields: {},
          settings: defaults,
        }
      } else {
        if (value.outputUrl) URL.revokeObjectURL(value.outputUrl)
        value = {
          ...value,
          outputUrl: null,
          result: null,
          crop: null,
          status: "processing",
          fields: {},
          ocr: null,
          variant: null,
          mrz: "",
        }
      }
      update(side, value)
      const result = await processor.current.process(file, {
        side,
        analyzeLayout: true,
        ...options,
      })
      if (alive.current) await readCrop(side, value, result)
    } catch (error) {
      if (alive.current) {
        setNotice(error.message)
        if (value)
          update(side, { ...value, status: "review", error: error.message })
      }
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  async function changeVariant(next) {
    if (store.getState().busy) return
    setOverride(next)
    clearOutputs()
    setNotice("")
    let chosen
    try {
      chosen = resolveVariant(
        store.getState().images.front?.variant,
        store.getState().images.back?.variant,
        next
      )
    } catch (error) {
      setNotice(error.message)
      return
    }
    if (!chosen) return

    setBusy(true)
    try {
      for (const side of sides) {
        const value = store.getState().images[side]
        if (value?.ocrSource === "gemini") {
          update(side, { ...value, fieldsVariant: chosen })
          continue
        }
        if (value?.ocr && value.fieldsVariant !== chosen) {
          const fields = await readFields(
            reader.current,
            value.ocr,
            chosen,
            side,
            value.crop
          )
          if (alive.current)
            update(side, { ...value, fields, fieldsVariant: chosen })
        }
      }
    } catch (error) {
      if (alive.current) setNotice(error.message)
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  function editField(side, key, value) {
    const current = store.getState().images[side]
    update(side, {
      ...current,
      fieldsVariant: variant,
      fields: {
        ...current.fields,
        [key]: { value, edited: true, confidence: 100 },
      },
    })
  }
  async function readGemini(side) {
    const value = store.getState().images[side]
    if (store.getState().busy || !value?.crop) return

    setBusy(true)
    setNotice("")
    setProgress("Đang gửi ảnh đã cắt cho Gemini…")
    try {
      const result = await gemini.current.process(value.crop, "identity", side)
      if (!alive.current) return
      const detectedVariant =
        result.variant === "unknown" ? value.variant : result.variant
      const chosen = resolveVariant(
        side === "front"
          ? detectedVariant
          : store.getState().images.front?.variant,
        side === "back"
          ? detectedVariant
          : store.getState().images.back?.variant,
        override
      )
      const fields = Object.fromEntries(
        Object.entries(result.fields).map(([key, text]) => [
          key,
          { value: text, confidence: 0, edited: false, useText: !!text.trim() },
        ])
      )
      update(side, {
        ...value,
        variant: detectedVariant,
        fields,
        fieldsVariant: chosen,
        ocrSource: "gemini",
        ocr: {
          text: [...Object.values(result.fields), result.mrz]
            .filter(Boolean)
            .join("\n"),
          words: [],
        },
        mrz: side === "back" ? result.mrz || value.mrz : value.mrz,
        error: "",
        warnings: [
          ...new Set([
            ...(value.warnings ?? []),
            "Thông tin do Gemini đọc có thể sai; hãy đối chiếu từng ô và MRZ trước khi tạo mẫu.",
            ...result.warnings,
          ]),
        ],
      })
    } catch (error) {
      if (alive.current) setNotice(error.message)
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  async function generate() {
    if (store.getState().busy) return
    if (variantError || !variant || !images.front?.crop || !images.back?.crop) {
      setNotice(
        variantError || "Hãy tải đủ hai mặt, cắt ảnh và xác định loại mẫu."
      )
      return
    }

    setBusy(true)
    setNotice("")
    setProgress("Đang đưa thông tin vào mẫu…")
    const next = []
    try {
      for (const side of sides) {
        const data = store.getState().images[side]
        const fields = {
          ...extractFields(data.ocr ?? { words: [] }, variant, side, 1011, 638),
          ...(data.fieldsVariant === variant ? data.fields : {}),
        }
        const blob = await renderTemplate(variant, side, { ...data, fields })
        next.push({ side, blob, url: URL.createObjectURL(blob) })
      }
      if (!alive.current) {
        next.forEach((item) => URL.revokeObjectURL(item.url))
        return
      }
      clearOutputs()
      setOutputs(next)
    } catch (error) {
      next.forEach((item) => URL.revokeObjectURL(item.url))
      if (alive.current) setNotice(error.message)
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  async function exportFile(format) {
    const { outputs, busy, gap } = store.getState()
    if (!outputs || busy) return

    setBusy(true)
    setNotice("")
    try {
      const card = {
        included: true,
        front: { result: outputs[0].blob },
        back: { result: outputs[1].blob },
      }
      const blob = await makeDocument([card], {
        format,
        dpi: 300,
        gap,
        quality: 0.95,
      })
      downloadBlob(blob, `cccd-mau.${format}`)
    } catch (error) {
      if (alive.current) setNotice(error.message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return {
    ...state,
    remove,
    variant,
    variantError,
    readGemini,
    run,
    changeVariant,
    editField,
    generate,
    exportFile,
  }
}
