import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Download, ScanText, RefreshCw, FileImage } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import ImageDropzone from "@/components/identify/image-dropzone"
import { createProcessor } from "@/lib/identify/processing"
import { defaults, fullCorners, validateFile } from "@/lib/identify/model"
import { makeDocument, downloadBlob } from "@/lib/identify/export"
import { createReader } from "@/lib/generator/ocr"
import { templates } from "@/lib/generator/templates"
import {
  detectVariant,
  resolveVariant,
  inspectMrz,
} from "@/lib/generator/model"
import {
  readFields,
  extractFields,
  renderTemplate,
  mrzImage,
} from "@/lib/generator/render"

const CardEditor = lazy(() => import("@/components/identify/card-editor"))
const sides = ["front", "back"]
const labelOf = (side) => (side === "front" ? "Mặt trước" : "Mặt sau")
const revoke = (value) => {
  if (value?.sourceUrl) URL.revokeObjectURL(value.sourceUrl)
  if (value?.outputUrl) URL.revokeObjectURL(value.outputUrl)
}
export default function GeneratorApp() {
  const [images, setImages] = useState({ front: null, back: null })
  const [selected, setSelected] = useState(null)
  const [override, setOverride] = useState("auto")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState("")
  const [notice, setNotice] = useState("")
  const [editor, setEditor] = useState(null)
  const [outputs, setOutputs] = useState(null)
  const [gap, setGap] = useState(12)
  const state = useRef(images),
    processor = useRef(null),
    reader = useRef(null),
    alive = useRef(false),
    running = useRef(false),
    outputsRef = useRef(null),
    selectedRef = useRef(null),
    pasteAction = useRef(null)
  useEffect(() => {
    alive.current = true
    processor.current = createProcessor()
    reader.current = createReader((message) => {
      if (alive.current) setProgress(message)
    })
    const handlePaste = (event) => {
      if (
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
      pasteAction.current?.(files)
    }
    document.addEventListener("paste", handlePaste)
    return () => {
      document.removeEventListener("paste", handlePaste)
      alive.current = false
      processor.current?.dispose()
      reader.current?.dispose()
      sides.forEach((side) => revoke(state.current[side]))
      outputsRef.current?.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])
  useEffect(() => {
    pasteAction.current = (files) => {
      if (busy || running.current || editor) {
        setNotice(
          "Hãy hoàn tất xử lý hoặc đóng chỉnh sửa trước khi dán ảnh khác."
        )
        return
      }
      const side = selectedRef.current
      if (!side) {
        setNotice(
          "Hãy chọn ô mặt trước hoặc mặt sau rồi dán ảnh bằng Ctrl/Cmd+V."
        )
        return
      }
      void run(side, files[0])
      if (files.length > 1)
        setNotice(
          "Đã nhận ảnh đầu tiên. Hãy dán từng ảnh vào mặt thẻ tương ứng."
        )
    }
  })
  function select(side) {
    selectedRef.current = side
    setSelected(side)
  }
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
  function clearOutputs() {
    outputsRef.current?.forEach((item) => URL.revokeObjectURL(item.url))
    outputsRef.current = null
    setOutputs(null)
  }
  function update(side, value) {
    state.current = { ...state.current, [side]: value }
    setImages(state.current)
    clearOutputs()
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
        side === "front" ? updated.variant : state.current.front?.variant,
        side === "back" ? updated.variant : state.current.back?.variant,
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
        const other = state.current[otherSide]
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
    if (running.current || busy) return
    running.current = true
    setBusy(true)
    setNotice("")
    setProgress("Đang cắt và nắn phối cảnh…")
    let value = state.current[side]
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
      running.current = false
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  async function changeVariant(next) {
    if (running.current || busy) return
    setOverride(next)
    clearOutputs()
    setNotice("")
    let chosen
    try {
      chosen = resolveVariant(
        state.current.front?.variant,
        state.current.back?.variant,
        next
      )
    } catch (error) {
      setNotice(error.message)
      return
    }
    if (!chosen) return
    running.current = true
    setBusy(true)
    try {
      for (const side of sides) {
        const value = state.current[side]
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
      running.current = false
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  function editField(side, key, value) {
    const current = state.current[side]
    update(side, {
      ...current,
      fieldsVariant: variant,
      fields: {
        ...current.fields,
        [key]: { value, edited: true, confidence: 100 },
      },
    })
  }
  async function generate() {
    if (running.current || busy) return
    if (variantError || !variant || !images.front?.crop || !images.back?.crop) {
      setNotice(
        variantError || "Hãy tải đủ hai mặt, cắt ảnh và xác định loại mẫu."
      )
      return
    }
    running.current = true
    setBusy(true)
    setNotice("")
    setProgress("Đang đưa thông tin vào mẫu…")
    const next = []
    try {
      for (const side of sides) {
        const data = state.current[side]
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
      outputsRef.current = next
      setOutputs(next)
    } catch (error) {
      next.forEach((item) => URL.revokeObjectURL(item.url))
      if (alive.current) setNotice(error.message)
    } finally {
      running.current = false
      if (alive.current) {
        setBusy(false)
        setProgress("")
      }
    }
  }
  async function exportFile(format) {
    if (!outputs || busy) return
    running.current = true
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
      running.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Đưa thông tin CCCD vào mẫu
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tải hai mặt thẻ để cắt, căn chỉnh và đọc thông tin. Chọn đúng mẫu, đối
          chiếu chữ và MRZ trước khi xuất Word hoặc PDF.
        </p>
        <p className="text-xs text-muted-foreground">
          Ảnh được xử lý trên thiết bị, không gửi lên máy chủ. Chân dung, QR,
          vân tay và dấu/chữ ký được lấy từ ảnh của bạn. Vùng chữ chưa đọc chắc
          và MRZ không khớp số kiểm tra sẽ giữ ảnh gốc.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="generator-template">Loại mẫu</Label>
          <NativeSelect
            id="generator-template"
            value={override}
            disabled={busy}
            onChange={(event) => changeVariant(event.target.value)}
          >
            <NativeSelectOption value="auto">Tự nhận diện</NativeSelectOption>
            {Object.entries(templates).map(([key, item]) => (
              <NativeSelectOption key={key} value={key}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          {variantError ||
            (variant
              ? `Mẫu đang dùng: ${templates[variant].label}`
              : "Chưa xác định loại thẻ")}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {sides.map((side) => (
          <div key={side} className="space-y-4">
            <ImageDropzone
              cardId="mẫu"
              side={side}
              label={labelOf(side)}
              value={images[side]}
              busy={busy}
              notify={setNotice}
              selected={selected === side}
              onSelect={() => select(side)}
              onFile={(file) => {
                select(side)
                void run(side, file)
              }}
              onEdit={() => setEditor(side)}
              onRemove={() => {
                revoke(images[side])
                update(side, null)
              }}
            />
            {images[side]?.crop && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="font-semibold">
                  <ScanText className="mr-2 inline size-4" />
                  Thông tin {labelOf(side).toLowerCase()}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Ô trống hoặc OCR dưới 80% sẽ giữ nguyên vùng ảnh gốc khi tạo
                  mẫu. Sửa ô để dùng chữ bạn đã đối chiếu.
                </p>
                {variant &&
                  templates[variant][side].fields.map((field) => {
                    const item = images[side].fields?.[field.key]
                    return (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`generator-${side}-${field.key}`}>
                          {field.label}
                          {item && !item.edited && item.confidence < 80
                            ? " · Cần kiểm tra"
                            : ""}
                        </Label>
                        <Input
                          id={`generator-${side}-${field.key}`}
                          value={item?.value ?? ""}
                          disabled={busy}
                          maxLength={250}
                          onChange={(event) =>
                            editField(side, field.key, event.target.value)
                          }
                        />
                      </div>
                    )
                  })}
                {side === "back" && (
                  <div className="space-y-2">
                    <Label htmlFor="generator-mrz">
                      MRZ · 3 dòng ở cuối mặt sau
                    </Label>
                    <Textarea
                      id="generator-mrz"
                      className="font-mono"
                      rows={3}
                      value={images.back.mrz ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        update("back", {
                          ...images.back,
                          mrz: event.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {inspectMrz(images.back.mrz).message}
                    </p>
                  </div>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer">
                    Toàn bộ chữ OCR đọc được
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto text-wrap">
                    {images[side].ocr?.text || "Chưa đọc được chữ."}
                  </pre>
                </details>
              </section>
            )}
          </div>
        ))}
      </div>
      {busy && (
        <div role="status" className="flex items-center gap-2 text-sm">
          <RefreshCw className="size-4 animate-spin" />
          {progress || "Đang xử lý…"}
        </div>
      )}
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={generate}
          disabled={
            busy ||
            !variant ||
            !!variantError ||
            !images.front?.crop ||
            !images.back?.crop
          }
        >
          <FileImage />
          Tạo bản mẫu
        </Button>
        <div className="flex items-center gap-2">
          <Label htmlFor="generator-gap">Khoảng cách hai mặt (mm)</Label>
          <Input
            id="generator-gap"
            className="w-20"
            type="number"
            min={0}
            max={50}
            value={gap}
            disabled={busy}
            onChange={(event) => setGap(Number(event.target.value))}
          />
        </div>
        <Button
          variant="outline"
          disabled={busy || !outputs}
          onClick={() => exportFile("pdf")}
        >
          <Download />
          Xuất PDF
        </Button>
        <Button
          variant="outline"
          disabled={busy || !outputs}
          onClick={() => exportFile("docx")}
        >
          <Download />
          Xuất Word
        </Button>
      </div>
      {outputs && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">
            Bản mẫu để xuất · 85,60 × 53,98 mm mỗi mặt
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {outputs.map((item) => (
              <figure key={item.side}>
                <img
                  src={item.url}
                  alt={`${labelOf(item.side)} sau khi đưa thông tin vào mẫu`}
                  className="w-full rounded-lg"
                />
                <figcaption className="mt-2 text-sm text-muted-foreground">
                  {labelOf(item.side)} · 1011 × 638px · 300 DPI
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            PDF và Word dùng trang A4, mỗi mặt đúng khổ thẻ. Khi in chọn kích
            thước thực / 100%.
          </p>
        </section>
      )}
      {editor && images[editor] && (
        <Suspense fallback={<p role="status">Đang tải trình chỉnh sửa…</p>}>
          <CardEditor
            value={images[editor]}
            label={labelOf(editor)}
            onClose={() => setEditor(null)}
            onAuto={() => run(editor, images[editor].file)}
            onApply={async (points, settings) => {
              const side = editor
              await run(side, images[side].file, { points, settings })
              setEditor(null)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
