import ImageDropzone from "@/components/identify/image-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { inspectMrz } from "@/lib/generator/model"
import { templates } from "@/lib/generator/templates"
import { Download, FileImage, RefreshCw, ScanText } from "lucide-react"
import { lazy, Suspense } from "react"
import { useGenerator } from "@/hooks/use-generator"
const CardEditor = lazy(() => import("@/components/identify/card-editor"))
const sides = ["front", "back"]
const labelOf = (side) => (side === "front" ? "Mặt trước" : "Mặt sau")

export default function GeneratorApp() {
  const {
    variant,
    variantError,
    readGemini,
    remove,
    run,
    changeVariant,
    editField,
    generate,
    exportFile,
    images,
    selected,
    override,
    busy,
    progress,
    notice,
    editor,
    outputs,
    gap,
    setNotice,
    setEditor,
    setGap,
    select,
    update,
  } = useGenerator()
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
          Mặc định ảnh được xử lý trên thiết bị. Khi bấm đọc bằng Gemini, ảnh
          mặt thẻ đã cắt sẽ được gửi qua máy chủ đến Google. Chân dung, QR, vân
          tay và dấu/chữ ký được lấy từ ảnh của bạn. OCR tại máy giữ nét gốc khi
          chưa đọc chắc. MRZ không khớp số kiểm tra luôn giữ ảnh nguồn, kể cả
          khi dùng Gemini.
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
              onRemove={() => remove(side)}
            />
            {images[side]?.crop && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => readGemini(side)}
              >
                <ScanText />
                Đọc lại {labelOf(side).toLowerCase()} bằng Gemini
              </Button>
            )}
            {images[side]?.crop && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="font-semibold">
                  <ScanText className="mr-2 inline size-4" />
                  Thông tin {labelOf(side).toLowerCase()}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {images[side].ocrSource === "gemini"
                    ? "Các ô này là chữ Gemini đọc và sẽ được dùng khi tạo mẫu. Hãy đối chiếu từng giá trị với ảnh gốc; ô trống vẫn giữ vùng ảnh nguồn."
                    : "Ô trống hoặc OCR dưới 80% sẽ giữ nguyên vùng ảnh gốc khi tạo mẫu. Sửa ô để dùng chữ bạn đã đối chiếu."}
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
