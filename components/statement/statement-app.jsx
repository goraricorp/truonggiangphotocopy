import {
  Upload,
  Trash2,
  RefreshCw,
  Download,
  Bold,
  Italic,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { statementDefaults } from "@/utils/constant"
import { paragraph } from "@/lib/statement/model"
import StatementPreview from "./statement-preview"
import { printPdf } from "@/lib/statement/export"
import { useStatement } from "@/hooks/use-statement"

export default function StatementApp() {
  const {
    pending,
    ready,
    input,
    append,
    pump,
    exportWord,
    pages,
    editing,
    provider,
    settings,
    notice,
    progress,
    exporting,
    setEditing,
    setProvider,
    setSettings,
    setNotice,
    patch,
    edit,
    remove,
  } = useStatement()
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">
          Ảnh văn bản thành bản đánh máy
        </h1>
        <p className="text-sm text-muted-foreground">
          Tải hoặc dán ảnh bằng Ctrl/Cmd+V. Các trang luôn nối theo thứ tự
          chọn/dán, không tự sắp xếp lại; có thể tiếp tục dán khi OCR đang chạy
          và xóa trang dán nhầm.
        </p>
        <p className="text-xs text-muted-foreground">
          Không giới hạn số trang trong ứng dụng; khả năng xử lý phụ thuộc bộ
          nhớ thiết bị. Mặc định OCR xử lý tại máy. Khi chọn Gemini, ảnh được
          gửi qua máy chủ đến Google. Hãy đối chiếu nội dung và bố cục trước khi
          xuất.
        </p>
      </header>
      <section className="space-y-2 rounded-xl border p-4">
        <Label htmlFor="statement-provider">Công cụ đọc ảnh</Label>
        <NativeSelect
          id="statement-provider"
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        >
          <NativeSelectOption value="local">
            OCR trên thiết bị
          </NativeSelectOption>
          <NativeSelectOption value="gemini">Gemini AI</NativeSelectOption>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          Áp dụng cho ảnh thêm mới và nút Đọc lại. Không tự gửi lại ảnh đã có.
          Gemini gửi ảnh đến Google và dùng hạn mức API của máy chủ; hãy đối
          chiếu kết quả trước khi xuất.
        </p>
      </section>
      <section
        className="space-y-3 rounded-xl border border-dashed p-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          append(Array.from(event.dataTransfer.files))
        }}
      >
        <Input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Tải các ảnh trang văn bản"
          onChange={(event) => {
            append(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()}>
          <Upload />
          Chọn nhiều ảnh
        </Button>
        <p className="text-sm text-muted-foreground">
          Hoặc kéo ảnh vào đây / dán liên tiếp. Mỗi ảnh là một trang nguồn; thứ
          tự trang hiển thị bên dưới cũng là thứ tự xuất.
        </p>
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">Định dạng bản đánh máy · A4</h2>
        <div className="flex flex-wrap items-end gap-4">
          <p className="pb-2 text-sm">Font: {statementDefaults.font}</p>
          <div className="space-y-1">
            <Label htmlFor="statement-font-size">Cỡ chữ (pt)</Label>
            <Input
              id="statement-font-size"
              type="number"
              min={8}
              max={36}
              className="w-20"
              value={settings.fontSize}
              disabled={exporting}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  fontSize: Number(event.target.value),
                })
              }
            />
          </div>
          {[
            ["left", "Lề trái"],
            ["right", "Lề phải"],
            ["top", "Lề trên"],
            ["bottom", "Lề dưới"],
          ].map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`statement-${key}`}>{label} (cm)</Label>
              <Input
                id={`statement-${key}`}
                type="number"
                min={0}
                max={7}
                step={0.1}
                className="w-20"
                disabled={exporting}
                value={settings[key] / 10}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    [key]: Number(event.target.value) * 10,
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Mặc định lề trái 3 cm, các lề khác 2 cm, cỡ chữ 14 và giãn dòng 1,5.
          Đoạn dài tự chảy sang trang tiếp theo để giữ đủ chữ.
        </p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="mr-auto text-sm">
          {pages.length} trang nguồn ·{" "}
          {pending
            ? `${pending} trang đang chờ/đọc · ${progress}`
            : "Đã hoàn tất hàng đợi"}
        </p>
        <Button disabled={!ready || exporting} onClick={exportWord}>
          <Download />
          Xuất Word
        </Button>
        <Button
          variant="outline"
          disabled={!ready || exporting}
          onClick={() => {
            try {
              printPdf(pages, settings)
            } catch (error) {
              setNotice(error.message)
            }
          }}
        >
          <Download />
          Xuất PDF
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        PDF mở hộp thoại in: chọn “Lưu thành PDF”, khổ A4 và tắt đầu/chân trang
        của trình duyệt. Times New Roman dùng font có trên thiết bị; nếu máy
        thiếu font, trình duyệt có thể thay font serif tương đương.
      </p>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      {!pages.length && (
        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          Chưa có trang nào. Hãy tải hoặc dán trang đầu tiên.
        </p>
      )}
      <div className="space-y-6">
        {pages.map((page, index) => (
          <section
            key={page.id}
            className="space-y-4 rounded-xl border p-4"
            aria-label={`Trang ${index + 1}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-semibold">Trang {index + 1}</h2>
              <span className="text-xs text-muted-foreground">
                {page.status === "queued"
                  ? "Đang chờ"
                  : page.status === "reading"
                    ? "Đang đọc chữ…"
                    : page.status === "ready"
                      ? `Đã đọc ${page.provider === "gemini" ? "bằng Gemini" : "trên thiết bị"} · hãy đối chiếu`
                      : "Cần bổ sung"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={["queued", "reading"].includes(page.status)}
                aria-expanded={editing === page.id}
                onClick={() => setEditing(editing === page.id ? null : page.id)}
              >
                {editing === page.id ? "Đóng chỉnh sửa" : "Chỉnh sửa nội dung"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={["queued", "reading"].includes(page.status)}
                onClick={() => {
                  patch(page.id, (item) => ({
                    ...item,
                    status: "queued",
                    provider,
                  }))
                  void pump()
                }}
              >
                <RefreshCw />
                Đọc lại
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Xóa trang ${index + 1}`}
                onClick={() => remove(page.id)}
              >
                <Trash2 />
                Xóa trang
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <img
                  src={page.url}
                  alt={`Ảnh gốc trang ${index + 1}`}
                  loading="lazy"
                  className="max-h-96 w-full rounded-lg border object-contain"
                />
                <p className="mt-2 text-xs break-all text-muted-foreground">
                  {page.file.name}
                </p>
              </div>
              <div className="min-w-0 space-y-3">
                {page.warning && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {page.warning}
                  </p>
                )}
                {page.error && (
                  <p className="text-sm text-destructive">{page.error}</p>
                )}
                {page.status === "reading" && (
                  <p role="status" className="flex items-center gap-2 text-sm">
                    <RefreshCw className="size-4 animate-spin" />
                    Đang nhận diện nội dung và đoạn văn…
                  </p>
                )}
                <StatementPreview
                  page={page}
                  settings={settings}
                  number={index + 1}
                />
                {editing === page.id &&
                  page.paragraphs.map((item, pIndex) => (
                    <div
                      key={pIndex}
                      className="space-y-2 rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={`statement-${page.id}-${pIndex}`}>
                          Đoạn {pIndex + 1}
                        </Label>
                        <NativeSelect
                          aria-label={`Căn đoạn ${pIndex + 1} trang ${index + 1}`}
                          disabled={["queued", "reading"].includes(page.status)}
                          value={item.alignment}
                          onChange={(event) =>
                            edit(page.id, pIndex, {
                              alignment: event.target.value,
                            })
                          }
                        >
                          <NativeSelectOption value="left">
                            Căn trái
                          </NativeSelectOption>
                          <NativeSelectOption value="center">
                            Căn giữa
                          </NativeSelectOption>
                          <NativeSelectOption value="right">
                            Căn phải
                          </NativeSelectOption>
                          <NativeSelectOption value="justify">
                            Căn đều
                          </NativeSelectOption>
                        </NativeSelect>
                        <Button
                          variant={item.bold ? "secondary" : "ghost"}
                          size="icon-sm"
                          aria-label={`In đậm đoạn ${pIndex + 1} trang ${index + 1}`}
                          disabled={["queued", "reading"].includes(page.status)}
                          aria-pressed={item.bold}
                          onClick={() =>
                            edit(page.id, pIndex, { bold: !item.bold })
                          }
                        >
                          <Bold />
                        </Button>
                        <Button
                          variant={item.italic ? "secondary" : "ghost"}
                          size="icon-sm"
                          aria-label={`In nghiêng đoạn ${pIndex + 1} trang ${index + 1}`}
                          disabled={["queued", "reading"].includes(page.status)}
                          aria-pressed={item.italic}
                          onClick={() =>
                            edit(page.id, pIndex, { italic: !item.italic })
                          }
                        >
                          <Italic />
                        </Button>
                        <NativeSelect
                          aria-label={`Kiểu đoạn ${pIndex + 1} trang ${index + 1}`}
                          disabled={["queued", "reading"].includes(page.status)}
                          value={item.type}
                          onChange={(event) =>
                            edit(page.id, pIndex, { type: event.target.value })
                          }
                        >
                          <NativeSelectOption value="paragraph">
                            Văn bản
                          </NativeSelectOption>
                          <NativeSelectOption value="table">
                            Bảng (cột cách bằng Tab)
                          </NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <Textarea
                        id={`statement-${page.id}-${pIndex}`}
                        aria-label={`Nội dung đoạn ${pIndex + 1} trang ${index + 1}`}
                        disabled={["queued", "reading"].includes(page.status)}
                        value={item.text}
                        onChange={(event) =>
                          edit(page.id, pIndex, { text: event.target.value })
                        }
                        rows={Math.min(
                          12,
                          Math.max(3, item.text.split("\n").length)
                        )}
                        style={{
                          fontFamily: '"Times New Roman",Times,serif',
                          fontSize: `${settings.fontSize}pt`,
                          fontWeight: item.bold ? 700 : 400,
                          fontStyle: item.italic ? "italic" : "normal",
                          textAlign: item.alignment,
                          lineHeight: settings.lineSpacing,
                        }}
                      />
                    </div>
                  ))}
                {editing === page.id &&
                  !["queued", "reading"].includes(page.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        patch(page.id, (item) => ({
                          ...item,
                          paragraphs: [...item.paragraphs, paragraph()],
                        }))
                      }
                    >
                      <Plus />
                      Thêm đoạn
                    </Button>
                  )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
