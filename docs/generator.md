# Đưa thông tin CCCD vào mẫu

Mở `/generator` hoặc nút **Đưa CCCD vào mẫu** ở trang chủ.

1. Tải mặt trước và mặt sau của cùng thẻ. Có thể bấm chọn ô (ô đang chọn có viền nổi bật), rồi dán ảnh bằng Ctrl/Cmd+V. Dán chữ trong ô nhập vẫn hoạt động bình thường. Chỉ dán ảnh tiếp theo sau khi lượt xử lý hiện tại hoàn tất. Dùng lại worker `/identify` để tìm góc, cắt, xoay và sửa phối cảnh; có thể mở chỉnh sửa để đặt lại góc.
2. Tesseract.js đọc tiếng Việt/Anh trên toàn thẻ và các vùng dữ liệu. Nhận loại thẻ theo tiêu đề, vị trí QR/vân tay; có thể chọn mẫu thủ công khi ảnh không rõ. Hai mặt được nhận thành hai loại khác nhau phải được kiểm tra trước khi ghép.
3. Đối chiếu các ô thông tin và ba dòng MRZ. OCR không bảo đảm đúng mọi ký tự, dấu tiếng Việt hoặc chữ trên ảnh mờ/lóa. Ô có độ tin cậy dưới 80 hoặc chưa đọc được dùng nét chữ từ vùng ảnh gốc; ô được người dùng sửa sẽ dùng chữ đã nhập. Đây là ngưỡng của bộ OCR, không phải xác suất thông tin chính xác.
4. Chọn **Tạo bản mẫu**, kiểm tra ảnh kết quả rồi xuất PDF/Word. Cần tạo lại sau khi thay ảnh, sửa chữ, đổi MRZ hoặc mẫu; không xuất bản cũ sau khi dữ liệu thay đổi.

## Hai mẫu

- `docs/new.png`: có vân tay, QR mặt trước; mặt trước `(3,3,500,295)`, mặt sau `(3,304,500,297)`.
- `docs/image.png`: không có vân tay, QR mặt sau; mặt trước `(0,0,780,515)`, mặt sau `(0,525,780,515)`.
- `lib/generator/templates.js` khai báo riêng vùng dữ liệu nguồn và vị trí đích cho từng mẫu. Bố cục thực tế khác đáng kể, ảnh bị mất nội dung hoặc thẻ thuộc phiên bản khác vẫn cần kiểm tra/chỉnh lại.
- Chân dung, QR, vân tay và dấu/chữ ký được cắt từ chính ảnh tải lên. Không dùng thông tin cá nhân trong ảnh ví dụ để điền cho người khác. Không tái tạo thông tin đã mất.
- MRZ là vùng chữ máy đọc gồm ba dòng, không phải một dòng mã hóa. Chỉ đọc/giữ dữ liệu có sẵn. Kiểm tra cấu trúc TD1 (3 × 30 ký tự), số kiểm tra của số tài liệu, ngày sinh, ngày hết hạn và số kiểm tra tổng hợp; không tự suy ra ký tự hoặc sinh MRZ mới. Nếu kiểm tra không khớp, lấy nét MRZ gốc và hiển thị cảnh báo.
- Vùng ảnh chữ được tách nét bằng ngưỡng sáng cục bộ để ghép lên nền mẫu; không phải phục hồi chi tiết đã mất. Luôn đối chiếu ảnh gốc, đặc biệt vùng bị che hoặc chữ mờ.

## Xuất tài liệu và riêng tư

Dùng chung `makeDocument` với `/identify`: A4, mỗi mặt **85,60 × 53,98 mm**, ảnh **1011 × 638px / 300 DPI**, khoảng cách hai mặt 0–50 mm. Mặc định 12 mm. Chọn in kích thước thực / 100%.

Mặc định OCR tại máy giữ ảnh và chữ trong bộ nhớ trang. Nút Đọc lại bằng Gemini gửi đúng ảnh mặt thẻ đã cắt qua máy chủ đến Google; kết quả AI dùng làm chữ để tạo mẫu và được đánh dấu cần kiểm tra, không gán điểm tin cậy giả. Lỗi Gemini không thay dữ liệu đã có. Ứng dụng không lưu ảnh/chữ vào localStorage/IndexedDB. URL ảnh được thu hồi khi thay/xóa/rời trang. Tesseract worker, WASM và mô hình tiếng Việt/Anh được xuất tĩnh từ dependency qua `/ocr/*`; không tải mã hay mô hình từ CDN. Lần đầu OCR cần tải các tài nguyên này; phiên worker được tái sử dụng cho các lượt đọc tiếp theo. Cache HTTP có thể giữ tài nguyên mô hình, không lưu ảnh người dùng.

Bốn ảnh trong `tmp/template/` chỉ dùng để kiểm tra cục bộ, không import vào source/public hoặc đưa vào bản build. `tmp/` vẫn bị loại qua `.gitignore`.

## Kiểm tra

- `bun run test`: Vitest cho bộ xử lý hiện có và `tests/generator.test.js` (chọn mẫu, vùng dữ liệu, MRZ, tránh điền dữ liệu thiếu).
- `bunx --no-install eslint lib/generator components/generator 'pages/ocr/[asset].js' workers/identify.worker.js tests/generator.test.js`.
- `bun run build`.
- Đã kiểm tra upload hai bộ ảnh cục bộ, chọn đúng loại và tải PDF/Word bằng trình duyệt; kiểm tra không phát sinh request sang dịch vụ bên ngoài.

Tích hợp theo [API Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) và [hướng dẫn tự phục vụ tài nguyên](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md). Các dependency Tesseract.js và dữ liệu ngôn ngữ giữ nguyên giấy phép trong package; tài nguyên được tạo khi build từ đúng phiên bản trong `bun.lock`.

Các lượt OCR tên không thống nhất được đánh dấu cần kiểm tra; phần chữ dư do hoa văn không tự nối vào tên đã đọc ở lượt toàn thẻ. Khi giữ nét chữ gốc, phép ghép giữ nguyên tỷ lệ để không kéo dãn chữ/ngày tháng.
