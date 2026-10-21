import { memo } from "react"
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table"
import { tableRows } from "@/lib/statement/export"
import { validateSettings } from "@/lib/statement/model"

function StatementPreview({ page, settings, number }) {
  let format
  try {
    format = validateSettings(settings)
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    )
  }
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium">Bản xem trước A4</p>
      <div className="overflow-x-auto rounded-lg bg-muted/50 p-3 sm:p-5">
        <article
          aria-label={`Bản đánh máy trang ${number}`}
          className="mx-auto min-h-[297mm] w-[210mm] bg-white text-black shadow-md"
          style={{
            padding: `${format.top}mm ${format.right}mm ${format.bottom}mm ${format.left}mm`,
            fontFamily: '"Times New Roman",Times,serif',
            fontSize: `${format.fontSize}pt`,
            lineHeight: format.lineSpacing,
          }}
        >
          {page.paragraphs.map((item, index) => {
            const style = {
              textAlign: item.alignment,
              fontWeight: item.bold ? 700 : 400,
              fontStyle: item.italic ? "italic" : "normal",
              marginLeft: item.indent === 10 ? "10mm" : 0,
            }
            return item.type === "table" ? (
              <Table
                key={index}
                className="mb-[8pt] table-fixed border-collapse text-inherit"
                style={{ ...style, fontSize: "inherit", lineHeight: "inherit" }}
              >
                <TableBody>
                  {tableRows(item.text).map((row, rowIndex) => (
                    <TableRow
                      key={rowIndex}
                      className="border-0 hover:bg-transparent"
                    >
                      {row.map((cell, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          className="border border-black p-[4pt] align-top [overflow-wrap:anywhere] whitespace-pre-wrap"
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p
                key={index}
                className="mb-[8pt] [overflow-wrap:anywhere] whitespace-pre-wrap"
                style={{ ...style, fontSize: "inherit", lineHeight: "inherit" }}
              >
                {item.text || "\u00a0"}
              </p>
            )
          })}
          {!page.paragraphs.length && (
            <p className="text-center text-gray-500">
              {["queued", "reading"].includes(page.status)
                ? "Đang đọc nội dung từ ảnh…"
                : "Chưa có nội dung được nhận diện."}
            </p>
          )}
        </article>
      </div>
      <p className="text-xs text-muted-foreground">
        Nội dung dài được hiển thị đầy đủ; khi xuất sẽ tự ngắt sang trang A4
        tiếp theo.
      </p>
    </div>
  )
}

export default memo(StatementPreview)
