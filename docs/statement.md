# Đánh máy văn bản từ ảnh

Mở `/statement` hoặc nút **Đánh máy văn bản từ ảnh** ở trang chủ.

- Chọn nhiều ảnh, kéo thả hoặc dán liên tiếp bằng Ctrl/Cmd+V. Ảnh được nối ngay vào cuối danh sách theo đúng thứ tự nhận; có thể thêm ảnh trong lúc OCR đang chạy. Không tự sắp xếp theo tên file hay thứ tự OCR hoàn tất.
- Không đặt giới hạn số trang. Mỗi ảnh JPEG/PNG/WebP tối đa 20 MB và 60 triệu điểm ảnh; tổng số trang thực tế phụ thuộc bộ nhớ thiết bị. Hàng đợi đọc một ảnh/lần, tái sử dụng worker tiếng Việt/Anh.
- Nút **Xóa trang** dùng được cả với trang đang chờ/đang đọc. Kết quả đến muộn của trang đã xóa không được chèn lại; các trang còn lại được đánh số liên tục và giữ nguyên thứ tự.
- Sửa nội dung từng đoạn, căn trái/giữa/phải/đều, bật đậm/nghiêng hoặc chọn bảng. Nội dung bảng dùng Tab phân tách cột, xuống dòng phân tách hàng. Có thể thêm đoạn hoặc đọc lại ảnh.
- Không tự bỏ qua trang lỗi/trống khi xuất. Cần sửa/bổ sung, đọc lại hoặc xóa trang đó. Danh sách thay đổi trong lúc tạo Word sẽ yêu cầu xuất lại để tránh tải tài liệu thiếu trang mới.

Mặc định A4, **Times New Roman 14 pt**, giãn dòng 1,5; lề **trái 3 cm**, phải/trên/dưới **2 cm**. Có thể đổi cỡ chữ và lề. Mỗi ảnh bắt đầu một trang nguồn mới trong tài liệu; nếu văn bản dài hơn vùng in, nội dung tự chảy sang trang tiếp theo, không cắt bớt chữ.

**Word** tải `.docx` chứa đoạn và bảng thực, chỉnh sửa được. **PDF** mở cửa sổ in của trình duyệt: chọn **Lưu thành PDF**, A4 và tắt đầu/chân trang trình duyệt. PDF giữ văn bản chọn/sao chép được, không phải ảnh chụp trang. Font Times New Roman cần có trên thiết bị để PDF dùng chính xác font này; máy thiếu font sẽ dùng serif thay thế. Không phân phối font thương mại của hệ điều hành trong mã nguồn.

OCR giữ thứ tự các khối/đoạn và suy ra một số định dạng như tiêu đề, căn lề, đậm/nghiêng, thụt đầu đoạn và bảng đơn giản từ vị trí chữ. Bố cục nhiều cột, bảng ghép ô, chữ mờ, dấu tiếng Việt, chữ ký và công thức có thể không được nhận đúng; không cam kết tái tạo chính xác tuyệt đối ảnh gốc. Luôn đối chiếu và sửa trước khi xuất. Chữ viết tay hoặc thông tin không đọc được không được tự bịa thêm.

Với OCR trên thiết bị, ảnh/chữ chỉ xử lý trong bộ nhớ trang và không gửi đến dịch vụ ngoài. Khi chọn Gemini, ảnh trang mới hoặc trang bấm Đọc lại được gửi qua máy chủ đến Google; loại công cụ được ghi riêng trên mỗi trang, không tự đổi các trang đang chờ. Ứng dụng không lưu ảnh/chữ vào localStorage/IndexedDB. Xóa trang hoặc đóng công cụ sẽ thu hồi URL ảnh; các mô hình OCR tĩnh được tải cùng origin qua `/ocr/*` như generator. Không sửa `components/ui`.

Kiểm thử: `bun run test -- tests/statement.test.js tests/generator-ocr.test.js`, lint các thư mục `lib/statement`, `components/statement` và `bun run build`. Kiểm tra trình duyệt dùng ảnh văn bản tổng hợp để xác minh paste liên tiếp, xóa trang giữa và xuất Word/PDF. Không đưa ảnh cá nhân vào bộ mẫu hoặc bản build.
