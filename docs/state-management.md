# State của các công cụ

Dùng Zustand đã cài sẵn. Mỗi lần mount một công cụ tạo một vanilla store riêng qua `useToolStore`; không dùng singleton phía server, localStorage, sessionStorage hay middleware persist. File, Blob và URL ảnh chỉ tồn tại trong phiên của công cụ như trước.

- `stores/identify-store.js`: danh sách CCCD, chọn ô, cập nhật theo token, đổi thứ tự và tùy chọn xuất.
- `stores/generator-store.js`: hai mặt thẻ, trường đã đọc, loại mẫu và kết quả sinh. Thay nội dung xóa kết quả cũ và thu hồi URL.
- `stores/statement-store.js`: thứ tự trang, đoạn/bảng, chỉnh sửa và tùy chọn định dạng. Kết quả đến chậm không đưa lại trang đã xóa.
- `stores/create-tool-store.js`: tạo setter ổn định, hỗ trợ cập nhật theo giá trị trước; giá trị không đổi không phát thông báo thừa.
- `hooks/use-identify.js`, `use-generator.js`, `use-statement.js`: điều phối worker/OCR/Gemini và xuất tài liệu. Đọc `store.getState()` khi cần dữ liệu mới nhất thay vì giữ bản sao state trong ref.
- `hooks/use-image-paste.js`: một listener ảnh clipboard cho từng công cụ, dùng Effect Event để luôn đọc callback hiện tại.

Các component app chứa phần giao diện. Worker, AbortController và khóa hàng đợi vẫn nằm trong ref vì là tài nguyên vòng đời, không phải dữ liệu để render. Rời trang hủy công việc/worker và thu hồi URL ảnh; store không lưu dữ liệu CCCD lâu dài. Preview A4 được memo hóa để tiến độ OCR không dựng lại các trang không đổi.

Kiểm thử: `tests/tool-stores.test.js` dùng Vitest kiểm tra store độc lập, setter đồng bộ, kết quả cũ/token sai, đổi thứ tự, xóa trang, giải phóng URL và bỏ qua cập nhật không đổi. Các test xử lý ảnh, OCR, Gemini và xuất tài liệu vẫn giữ nguyên.
