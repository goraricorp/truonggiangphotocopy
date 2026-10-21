import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { A4, CARD, pageLayout } from "@/lib/identify/model"
import { appGlobal } from "@/utils/constant"
import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react"
import { lazy, Suspense } from "react"
import ImageDropzone from "./image-dropzone"
import { useIdentify } from "@/hooks/use-identify"
import { newCard, cardSides as sides } from "@/stores/identify-store"
const loadEditor = () => import("./card-editor")
const CardEditor = lazy(loadEditor)
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
  const {
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
    cards,
    selected,
    notice,
    preparing,
    editor,
    replacement,
    pasteFiles,
    pasteTarget,
    format,
    dpi,
    gap,
    quality,
    exporting,
    preview,
    setNotice,
    setEditor,
    setPasteFiles,
    setPasteTarget,
    setFormat,
    setDpi,
    setGap,
    setQuality,
    setPreview,
    replaceCards,
    select,
    reorder,
  } = useIdentify()
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
      {preparing && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <RefreshCw className="size-4 animate-spin" />
          Đang chuẩn bị bộ xử lý ảnh. Bạn có thể chọn hoặc dán ảnh ngay.
        </p>
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
                    size="icon"
                    aria-label={`Đưa CCCD ${index + 1} lên`}
                    disabled={index === 0 || busy}
                    onClick={() => reorder(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Đưa CCCD ${index + 1} xuống`}
                    disabled={index === cards.length - 1 || busy}
                    onClick={() => reorder(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
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
              <Label htmlFor="export-gap">
                Lề trên và khoảng cách hai mặt (mm)
              </Label>
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
