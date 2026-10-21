# Xử lý ảnh bằng Gemini

## Cấu hình

1. Sao chép `.env.example` thành `.env.local`.
2. Điền `GEMINI_API_KEY` lấy từ Google AI Studio. Không dùng tiền tố `PUBLIC_`, không đưa key vào trình duyệt hoặc commit `.env.local`.
3. `GEMINI_MODEL` mặc định `gemini-3.8-flash`; có thể đổi sang model Gemini hỗ trợ ảnh và structured JSON mà tài khoản có quyền sử dụng.
4. Chạy lại `bun run dev`. Production: `bun run build`, sau đó `bun run start`.

Các biến được đọc/kiểm tra tập trung trong `utils/environment.js` qua `astro:env/server`. Không đọc file env hoặc env trực tiếp rải rác trong mã ứng dụng. Lệnh start dùng Node >=24 và nạp `.env.local` nếu có; biến môi trường do host cấp vẫn được ưu tiên.

- `GEMINI_API_KEY`: key server; để trống thì OCR tại máy vẫn chạy, API Gemini trả thông báo chưa cấu hình.
- `GEMINI_MODEL`: tên model Gemini, không phải URL.
- `GEMINI_TIMEOUT_MS`: mặc định 90000 ms, từ 1000 đến 180000.
- `GEMINI_MAX_IMAGE_MB`: mặc định 10 MiB, từ 1 đến 14 MiB; ảnh gửi inline bằng base64.
- `GEMINI_MAX_CONCURRENT_REQUESTS`: mặc định 2 yêu cầu đồng thời trên mỗi tiến trình server. Vượt giới hạn trả lỗi để đọc lại, không âm thầm bỏ trang.

## Cách dùng

- `/statement`: chọn **Công cụ đọc ảnh → Gemini AI**, sau đó tải/dán ảnh hoặc bấm **Đọc lại** trên trang đã có. Mỗi trang giữ công cụ đã chọn lúc thêm/đọc lại, nên đổi lựa chọn không tự gửi các trang đang chờ. Thứ tự, xóa trang, sửa đoạn/bảng và xuất Word/PDF vẫn dùng luồng hiện có.
- `/generator`: ảnh vẫn cắt bằng worker tại máy. Khi đã cắt được, bấm **Đọc lại mặt trước/mặt sau bằng Gemini**. Chỉ gửi mặt đã chọn; dữ liệu AI được điền vào các ô và dùng khi tạo mẫu, luôn đánh dấu cần đối chiếu. Không gán độ tin cậy giả cho dữ liệu AI. MRZ không khớp cấu trúc/số kiểm tra vẫn dùng vùng ảnh gốc; không tự sinh lại MRZ.
- `/identify` tiếp tục dùng nhận diện/nắn phối cảnh tại máy. Gemini ở đây phục vụ đọc chữ/bố cục, không thay mô hình tìm góc hoặc khôi phục thông tin đã mất.

Gemini có thể đọc sai hoặc thêm chữ; kiểm tra tên, số, ngày tháng, bảng và MRZ trước khi xuất. Chỉ gửi ảnh lên Google khi chọn Gemini hoặc bấm nút Gemini. Cách xử lý dữ liệu/hạn mức/chi phí của Google phụ thuộc dịch vụ và tài khoản API; không xem Gemini là OCR chạy offline.

## Server và triển khai

Đã thêm `@astrojs/node` bằng `bun add @astrojs/node`. API động `POST /api/gemini?task=statement` hoặc `task=identity&side=front|back` nhận body ảnh JPEG/PNG/WebP; `GET /api/gemini` chỉ trả trạng thái cấu hình/model/giới hạn không bí mật. Không nhận URL ảnh, prompt tùy ý hoặc model do trình duyệt chỉ định.

Key nằm trong header server → Google, không ở URL; không trả raw lỗi Google, không ghi ảnh/chữ/key vào log. Response API không cache. Ảnh được xử lý trong bộ nhớ request, không lưu vào filesystem hoặc dùng Google Files API. JSON phản hồi được kiểm tra schema; phản hồi bị cắt/hạn mức/timeout không được coi là trang thành công.

Các trang vẫn prerender, API cần runtime Node. Không thể chỉ đưa `dist/client` lên hosting tĩnh rồi gọi Gemini. Triển khai bằng server `dist/server/entry.mjs` hoặc đổi adapter phù hợp host. Dự án hiện chưa có đăng nhập: nếu mở endpoint dùng key trả phí cho công chúng, cần xác thực/quota ở tầng triển khai; giới hạn đồng thời hiện tại không thay thế xác thực.

Lockfile và `node_modules` chỉ được Bun cập nhật tự động khi cài package; không chỉnh tay. Không cài Gemini SDK vì gọi REST bằng `fetch` sẵn có.

## Kiểm chứng

Vitest dùng mock transport để kiểm tra payload ảnh inline, schema, lỗi quyền/hạn mức/timeout, giới hạn ảnh, request đồng thời, hủy client và không lộ key. Build và kiểm tra server thật không cần key. Đã xác minh API key hiện tại bằng ảnh văn bản tự tạo: Gemini đọc đúng chữ tiếng Việt và số, trả JSON hợp lệ. Không dùng ảnh CCCD cá nhân để thử API tự động. Schema gửi Google dùng enum số cho thụt lề và bỏ giới hạn độ dài/mảng lớn; Zod vẫn kiểm tra đầy đủ giới hạn ở server.

Nguồn: [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [GenerateContent REST](https://ai.google.dev/api/generate-content), [model hiện hành](https://ai.google.dev/gemini-api/docs/models), [Astro Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/), [Astro environment variables](https://docs.astro.build/en/guides/environment-variables/).
