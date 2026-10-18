import { appGlobal } from "@/utils/constant"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  Plus,
  ScanLine,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  X,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  CARD,
  A4,
  defaults,
  validateFile,
  imageDimensionsSchema,
  pageLayout,
  readyCards,
} from "@/lib/identify/model"
import { createProcessor } from "@/lib/identify/processing"
import { makeDocument, downloadBlob, fileName } from "@/lib/identify/export"
import ImageDropzone from "./image-dropzone"

const CardEditor = lazy(() => import("./card-editor"))
const sides = ["front", "back"]
const newCard = () => ({
  id: crypto.randomUUID(),
  included: true,
  front: null,
  back: null,
})
const release = (side) => {
  if (side?.sourceUrl) URL.revokeObjectURL(side.sourceUrl)
  if (side?.outputUrl) URL.revokeObjectURL(side.outputUrl)
}
function Preview({ cards, gap }) {
  const layout = pageLayout(gap)
  return (
    <div className="space-y-4">
      {cards
        .filter((c) => c.included)
        .map((card, index) => (
          <div key={card.id}>
            <p className="mb-2 text-xs text-muted-foreground">
              Trang {index + 1} · A4 · 210 × 297 mm
            </p>
            <div
              className="relative w-full overflow-hidden border bg-white shadow-sm"
              style={{ aspectRatio: `${A4.width}/${A4.height}` }}
            >
              {sides.map((side, i) => (
                <div
                  key={side}
                  className="absolute flex items-center justify-center"
                  style={{
                    left: `${(layout.x / A4.width) * 100}%`,
                    top: `${((i ? layout.backTop : layout.top) / A4.height) * 100}%`,
                    width: `${(CARD.width / A4.width) * 100}%`,
                    height: `${(CARD.height / A4.height) * 100}%`,
                  }}
                >
                  {card[side]?.outputUrl ? (
                    <img
                      src={card[side].outputUrl}
                      alt={`CCCD ${index + 1} ${i ? "mặt sau" : "mặt trước"} trên A4`}
                      className="size-full object-fill"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                      Chưa có {i ? "mặt sau" : "mặt trước"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
export default function IdentifyApp() {
  const [cards, setCards] = useState(() => [newCard()]),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(null),
    [replacement, setReplacement] = useState(null),
    [pasteFiles, setPasteFiles] = useState([]),
    [pasteTarget, setPasteTarget] = useState(""),
    [format, setFormat] = useState("pdf"),
    [dpi, setDpi] = useState(300),
    [gap, setGap] = useState(12),
    [quality, setQuality] = useState(0.95),
    [exporting, setExporting] = useState(false),
    [preview, setPreview] = useState(false)
  const cardsRef = useRef(cards),
    processor = useRef(null),
    controllers = useRef(new Map()),
    mounted = useRef(true),
    pasteAction = useRef(null),
    selectedRef = useRef(null),
    confirmResolve = useRef(null)
  const replaceCards = (fn) => {
    const next = fn(cardsRef.current)
    cardsRef.current = next
    if (mounted.current) setCards(next)
  }
  const patch = (id, side, token, fn) =>
    replaceCards((list) =>
      list.map((c) =>
        c.id === id && c[side]?.token === token
          ? { ...c, [side]: fn(c[side]) }
          : c
      )
    )
  useEffect(() => {
    mounted.current = true
    const tasks = controllers.current
    const handlePaste = (event) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest("input,textarea,[contenteditable=true]")
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
      mounted.current = false
      document.removeEventListener("paste", handlePaste)
      tasks.forEach((c) => c.abort())
      processor.current?.dispose()
      cardsRef.current.forEach((c) => sides.forEach((side) => release(c[side])))
      confirmResolve.current?.(false)
    }
  }, [])
  useEffect(() => {
    pasteAction.current = (files) => {
      const target = selectedRef.current
      if (target && cardsRef.current.some((c) => c.id === target.id)) {
        void upload(target.id, target.side, files[0])
        if (files.length > 1) setPasteFiles(files.slice(1))
      } else setPasteFiles(files)
    }
  })
  function select(id, side) {
    selectedRef.current = { id, side }
    setSelected({ id, side })
  }
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
    const value = cardsRef.current.find((c) => c.id === id)?.[side]
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
      const old = cardsRef.current.find((c) => c.id === id)?.[side]
      if (
        old &&
        !(await confirmReplace(
          `Thay ảnh ${side === "front" ? "mặt trước" : "mặt sau"}?`
        ))
      )
        return
      if (!cardsRef.current.some((c) => c.id === id)) return
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
    const value = cardsRef.current.find((c) => c.id === id)?.[side]
    release(value)
    replaceCards((list) =>
      list.map((c) => (c.id === id ? { ...c, [side]: null } : c))
    )
  }
  function removeCard(id) {
    sides.forEach((side) => {
      controllers.current.get(`${id}:${side}`)?.abort()
      release(cardsRef.current.find((c) => c.id === id)?.[side])
    })
    replaceCards((list) => list.filter((c) => c.id !== id))
    if (selectedRef.current?.id === id) {
      selectedRef.current = null
      setSelected(null)
    }
  }
  function reorder(index, delta) {
    replaceCards((list) => {
      const copy = [...list]
      ;[copy[index], copy[index + delta]] = [copy[index + delta], copy[index]]
      return copy
    })
  }
  function rerunCard(card) {
    for (const side of sides)
      if (card[side]) void run(card.id, side).catch((e) => setNotice(e.message))
  }
  async function exportAll() {
    setNotice("")
    try {
      readyCards(cardsRef.current)
      setExporting(true)
      const blob = await makeDocument(cardsRef.current, {
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
  return (
    <div className="space-y-7">
      <section className="rounded-3xl border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {appGlobal.name}
            </span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Photo căn cước, đúng khổ thật
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Thêm hai mặt, tự căn chỉnh phối cảnh, rồi xuất tài liệu A4. Mỗi
              mặt cố định{" "}
              <strong className="text-foreground">85,60 × 53,98 mm</strong>.
            </p>
          </div>
          <Button onClick={() => replaceCards((list) => [...list, newCard()])}>
            <Plus />
            Thêm CCCD
          </Button>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Ảnh của bạn được xử lý trực tiếp trên thiết bị và không được tải lên
          máy chủ.
        </p>
      </section>
      {notice && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>{notice}</p>
          <Button
            aria-label="Đóng thông báo"
            size="icon-sm"
            variant="ghost"
            onClick={() => setNotice("")}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !cards.some((c) => c.front || c.back)}
              onClick={() => cards.forEach(rerunCard)}
            >
              <ScanLine />
              Xử lý tất cả
            </Button>
            {busy && (
              <Button
                variant="outline"
                onClick={() => controllers.current.forEach((c) => c.abort())}
              >
                Hủy xử lý
              </Button>
            )}
            <p className="self-center text-xs text-muted-foreground">
              Chọn một ô rồi nhấn Ctrl+V hoặc Cmd+V để dán ảnh.
            </p>
          </div>
          {cards.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              Chưa có CCCD. Chọn “Thêm CCCD” để bắt đầu.
            </div>
          )}
          {cards.map((card, index) => (
            <article
              key={card.id}
              className="space-y-4 rounded-3xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`include-${card.id}`}
                    checked={card.included}
                    onCheckedChange={(checked) =>
                      replaceCards((list) =>
                        list.map((c) =>
                          c.id === card.id ? { ...c, included: checked } : c
                        )
                      )
                    }
                  />
                  <Label htmlFor={`include-${card.id}`}>
                    CCCD {index + 1} · Đưa vào tài liệu
                  </Label>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Đưa CCCD ${index + 1} lên`}
                    disabled={index === 0 || busy}
                    onClick={() => reorder(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Đưa CCCD ${index + 1} xuống`}
                    disabled={index === cards.length - 1 || busy}
                    onClick={() => reorder(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Xóa CCCD ${index + 1}`}
                    onClick={() => removeCard(card.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sides.map((side, i) => (
                  <ImageDropzone
                    key={side}
                    cardId={index + 1}
                    side={side}
                    label={i ? "Mặt sau" : "Mặt trước"}
                    value={card[side]}
                    selected={
                      selected?.id === card.id && selected.side === side
                    }
                    onSelect={() => select(card.id, side)}
                    onFile={(file) => upload(card.id, side, file)}
                    onEdit={() => setEditor({ id: card.id, side })}
                    onRemove={() => removeSide(card.id, side)}
                    busy={card[side]?.status === "processing"}
                    notify={setNotice}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {!card.front || !card.back
                    ? "Cần đủ ảnh hai mặt trước khi xuất."
                    : card.front.result && card.back.result
                      ? "Đã có hai mặt. Hãy kiểm tra chữ, mã QR và chiều ảnh."
                      : "Cần kiểm tra lại ảnh và đặt góc thủ công nếu cần."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || (!card.front && !card.back)}
                  onClick={() => rerunCard(card)}
                >
                  <RefreshCw />
                  Xử lý lại
                </Button>
              </div>
            </article>
          ))}
        </div>
        <aside className="space-y-5 xl:sticky xl:top-6">
          <section className="space-y-5 rounded-3xl border bg-card p-5">
            <h2 className="font-semibold">Xuất tất cả vào một tài liệu</h2>
            <p className="text-xs text-muted-foreground">
              Mỗi CCCD một trang A4. Mặt trước trên, mặt sau dưới, căn giữa.
              Không thay đổi kích thước thẻ.
            </p>
            <div className="space-y-2">
              <Label htmlFor="export-format">Định dạng</Label>
              <NativeSelect
                id="export-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <NativeSelectOption value="pdf">
                  PDF nhiều trang
                </NativeSelectOption>
                <NativeSelectOption value="docx">
                  Word (.docx)
                </NativeSelectOption>
                <NativeSelectOption value="png">
                  Ảnh PNG (ghép dọc)
                </NativeSelectOption>
                <NativeSelectOption value="jpeg">
                  Ảnh JPEG (ghép dọc)
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-gap">Khoảng cách hai mặt (mm)</Label>
              <Input
                id="export-gap"
                type="number"
                min={0}
                max={50}
                value={gap}
                onChange={(e) =>
                  setGap(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-dpi">Độ phân giải ảnh</Label>
              <NativeSelect
                id="export-dpi"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              >
                <NativeSelectOption value={300}>
                  300 DPI · ưu tiên in
                </NativeSelectOption>
                <NativeSelectOption value={150}>
                  150 DPI · nhẹ hơn
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {format === "jpeg" && (
              <div className="space-y-2">
                <Label htmlFor="jpeg-quality">Chất lượng JPEG (0,7–1)</Label>
                <Input
                  id="jpeg-quality"
                  type="number"
                  min={0.7}
                  max={1}
                  step={0.05}
                  value={quality}
                  onChange={(e) =>
                    setQuality(
                      Math.min(1, Math.max(0.7, Number(e.target.value) || 0.95))
                    )
                  }
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Phóng ảnh không khôi phục được chi tiết đã mất. Khi in, chọn “Kích
              thước thực / 100%”, không chọn vừa trang.
            </p>
            <Button
              className="w-full"
              disabled={busy || exporting || !cards.some((c) => c.included)}
              onClick={exportAll}
            >
              <Download />
              {exporting ? "Đang tạo tài liệu…" : "Xuất tất cả"}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? "Ẩn xem trước A4" : "Xem trước A4"}
            </Button>
          </section>
          {preview && <Preview cards={cards} gap={gap} />}
        </aside>
      </div>
      {editorValue && (
        <Suspense fallback={<p role="status">Đang tải trình chỉnh sửa…</p>}>
          <CardEditor
            key={`${editor.id}:${editor.side}:${editorValue.token}`}
            value={editorValue}
            label={editor.side === "front" ? "Mặt trước" : "Mặt sau"}
            onClose={() => setEditor(null)}
            onApply={(points, settings) =>
              run(editor.id, editor.side, { points, settings })
            }
            onAuto={() => run(editor.id, editor.side)}
          />
        </Suspense>
      )}
      <Dialog
        open={Boolean(replacement)}
        onOpenChange={(open) => {
          if (!open) answerReplace(false)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>{replacement ?? "Thay ảnh"}</DialogTitle>
          <DialogDescription>
            Ô này đã có ảnh. Thay thế sẽ bỏ ảnh và kết quả cũ của riêng mặt này.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => answerReplace(false)}>
              Giữ ảnh cũ
            </Button>
            <Button onClick={() => answerReplace(true)}>Thay thế</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pasteFiles.length > 0}
        onOpenChange={(open) => {
          if (!open) setPasteFiles([])
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>Chọn nơi dán ảnh</DialogTitle>
          <DialogDescription>
            Còn {pasteFiles.length} ảnh trong clipboard. Chọn mặt thẻ nhận ảnh;
            ảnh cũ chỉ bị thay khi bạn xác nhận.
          </DialogDescription>
          <NativeSelect
            aria-label="Đích đến của ảnh dán"
            value={pasteTarget}
            onChange={(e) => setPasteTarget(e.target.value)}
          >
            <NativeSelectOption value="">Chọn mặt thẻ</NativeSelectOption>
            {cards.flatMap((c, i) =>
              sides.map((s, j) => (
                <NativeSelectOption key={`${c.id}:${s}`} value={`${c.id}:${s}`}>
                  CCCD {i + 1} · {j ? "Mặt sau" : "Mặt trước"}
                </NativeSelectOption>
              ))
            )}
          </NativeSelect>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPasteFiles([])}>
              Hủy dán
            </Button>
            <Button
              disabled={!pasteTarget}
              onClick={() => {
                const [id, side] = pasteTarget.split(":")
                const file = pasteFiles[0]
                setPasteFiles((files) => files.slice(1))
                void upload(id, side, file)
              }}
            >
              Dán ảnh
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
