import { useDropzone } from "react-dropzone"
import { Upload, Pencil, Trash2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { downloadBlob, withDensity } from "@/lib/identify/export"

export default function ImageDropzone({
  cardId,
  side,
  label,
  value,
  selected,
  onSelect,
  onFile,
  onEdit,
  onRemove,
  busy,
  notify,
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
    noPaste: true,
    onDrop: (files) => {
      if (files[0]) onFile(files[0])
    },
    onDropRejected: () =>
      notify("Chỉ nhận một ảnh JPEG, PNG hoặc WebP, tối đa 20 MB."),
  })
  return (
    <section
      className={`space-y-3 rounded-2xl border p-4 ${selected ? "border-primary ring-2 ring-primary/15" : "border-border"}`}
      onFocusCapture={onSelect}
      onPointerDown={onSelect}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">
          {value?.result ? "85,60 × 53,98 mm" : "JPEG · PNG · WebP"}
        </span>
      </div>
      <div
        {...getRootProps()}
        className={`relative flex min-h-40 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-3 ${isDragActive ? "bg-primary/10" : "bg-muted/30"}`}
      >
        <Input
          {...getInputProps()}
          aria-label={`Tải ảnh ${label.toLowerCase()} CCCD ${cardId}`}
        />
        {value?.sourceUrl ? (
          <img
            src={value.outputUrl ?? value.sourceUrl}
            alt={`${label} ${value.result ? "đã căn chỉnh" : "gốc, chưa cắt"}`}
            className="max-h-52 w-full object-contain"
          />
        ) : (
          <>
            <Upload className="mb-3 size-7 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              Kéo ảnh vào đây hoặc chọn ô rồi dán ảnh
            </p>
          </>
        )}
        <Button className="mt-3" variant="outline" size="sm" onClick={open}>
          {value ? "Thay ảnh" : "Chọn ảnh"}
        </Button>
      </div>
      <p role="status" className="min-h-5 text-xs text-muted-foreground">
        {value?.status === "processing"
          ? "Đang xử lý trong hàng đợi…"
          : value?.error ||
            (!value
              ? "Chưa có ảnh"
              : value?.result
                ? value.warnings?.length
                  ? "Cần kiểm tra lại"
                  : "Đã xử lý thành công"
                : "Ảnh gốc được giữ nguyên; cần đặt lại bốn góc.")}
      </p>
      {value?.warnings?.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-amber-700 dark:text-amber-300">
          {value.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {value && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onEdit}>
            <Pencil />
            Chỉnh sửa
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
            <Trash2 />
            Xóa ảnh
          </Button>
          {value.result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  downloadBlob(
                    await withDensity(value.result, 300),
                    `cccd-${side === "front" ? "mat-truoc" : "mat-sau"}.png`
                  )
                } catch {
                  notify("Không tải được ảnh. Vui lòng thử lại.")
                }
              }}
            >
              <Download />
              Tải mặt này
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
