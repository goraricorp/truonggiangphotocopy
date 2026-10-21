# Công cụ photo CCCD

Mở /identify hoặc /identity. Mã nguồn React/JavaScript; không sửa components/ui.

## Sử dụng

1. Chạy `bun install`, `bun run dev`, mở http://localhost:5500/identify.
2. Thêm CCCD, chọn/kéo thả/dán JPEG, PNG hoặc WebP vào từng mặt. Giới hạn 20 MB và 60 triệu điểm ảnh mỗi ảnh. Không hỗ trợ HEIC.
3. Mỗi mặt tự xử lý sau khi nhận ảnh. Bộ OpenCV chỉ tải khi bắt đầu xử lý; hàng đợi chạy một ảnh/lần trong worker. Khi không nhận diện được, ảnh gốc được giữ lại.
4. Chọn Chỉnh sửa để kéo bốn góc, phóng to, di chuyển nền, xoay, chỉnh sáng/tương phản/nét và cắt lại. Có thể nhập tọa độ theo phần trăm. Thông số được áp dụng vào ảnh khi lưu.
5. Chọn các CCCD muốn xuất. Mỗi CCCD được chọn phải có đủ hai mặt đã xử lý. Xem trước A4 rồi xuất một file PDF, Word hoặc ảnh ghép dọc.
6. Khi in, chọn kích thước thực / 100%, không chọn tự co giãn vừa trang.

## Kích thước

Mọi mặt thẻ cố định **85,60 × 53,98 mm** theo yêu cầu. Không cung cấp tùy chọn phóng lớn. PDF dùng point; Word dùng EMU/twip. Ảnh thẻ raster là 1011 × 638px ở 300 DPI (làm tròn pixel); PNG/JPEG xuất có metadata mật độ in. A4 210 × 297 mm, mỗi CCCD một trang, mặc định lề trên 12 mm bằng đúng khoảng cách hai mặt 12 mm, căn giữa theo chiều ngang. Đổi khoảng cách cũng đổi lề trên tương ứng cho preview, PDF, Word và ảnh.

## Nhận diện và giới hạn

- Nhiều ngưỡng Canny và phân đoạn Otsu trên độ sáng, màu Lab, độ bão hòa HSV; morphology close, findContours, convexHull, nhiều mức approxPolyDP. Khớp bốn cạnh bằng fitLine rồi lấy giao điểm để giữ góc bo tròn, kiểm tra lồi và tỷ lệ cạnh. Chấm điểm ứng viên theo diện tích phủ và tỷ lệ, không hiển thị phần trăm tin cậy. getPerspectiveTransform/warpPerspective để cắt và sửa phối cảnh.
- Nhận diện hình học kết hợp đặc trưng các mẫu thẻ và màu nền xanh, không OCR và không xác minh đây là CCCD thật. Luôn kiểm tra bốn cạnh và chiều chữ.
- Cảnh báo mờ dựa trên phương sai Laplacian dưới 60 ở ảnh chuẩn hóa; cảnh báo lóa khi hơn 18% pixel gần trắng. Đây là heuristic, có thể báo dư với nền sáng, chưa được hiệu chuẩn trên bộ CCCD thực. Không tự tái tạo thông tin.
- Tăng sáng/độ tương phản và unsharp mask được giới hạn nhẹ. Ảnh mờ/lóa/mất cạnh không thể được phục hồi chi tiết đã mất.
- Worker giới hạn cạnh ảnh trung gian 2400px. Ảnh dài xuất bị chặn nếu vượt 30.000px chiều cao hoặc 60 triệu pixel; chọn PDF/Word thay thế. Chức năng không giới hạn số CCCD nhưng bộ nhớ thiết bị vẫn hữu hạn.
- Ảnh chỉ tồn tại trong bộ nhớ phiên, không gửi lên máy chủ hay lưu localStorage/IndexedDB; object URL bị thu hồi khi thay/xóa/đóng công cụ. Tải OpenCV và các chunk mã từ cùng ứng dụng.
- Cần trình duyệt mới hỗ trợ Worker, OffscreenCanvas và createImageBitmap.

## Kiểm tra

- `bun run test:identify` (Vitest): khổ vật lý, A4, hình học góc cắt, validation, chặn thiếu mặt, giữ thứ tự và lựa chọn xuất.
- `bunx --no-install eslint components/identify lib/identify workers/identify.worker.js tests/identify.test.js`.
- `bun run build`.

Tài liệu API đã tham khảo: [OpenCV](https://docs.opencv.org/5.0.0/dd/d52/tutorial_js_geometric_transformations.html), [react-dropzone](https://react-dropzone.js.org/), [Konva](https://konvajs.org/docs/react/Drag_And_Drop.html), [docx](https://docx.js.org/), [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfpage), [Zod](https://zod.dev/basics).

Ảnh thẻ dọc được chuẩn hóa theo cặp cạnh dài trước khi nắn phối cảnh. Phép chiếu bốn góc đồng thời sửa xoay và biến dạng phối cảnh theo hai trục trên mặt phẳng thẻ. Phần thẻ ngoài khung ảnh được bù trắng khi đủ bằng chứng hình học, không khôi phục nội dung. Chiều thẻ được suy ra qua đối chiếu mẫu; dùng editor để xoay lại nếu kết quả chưa đúng.

### Đối chiếu ảnh mẫu và bù phần nằm ngoài ảnh

Khi nhánh bố cục chưa xác nhận được thẻ, worker tải **cả ba ảnh mẫu nội bộ**, trích đặc trưng một lần và giữ trong bộ nhớ suốt phiên worker:

- `docs/image.png`: mẫu đối chiếu bổ sung; mặt trước `(0, 0, 780, 515)`, mặt sau `(0, 525, 780, 515)`.
- `docs/new.png`: mẫu chính; mặt trước `(3, 3, 500, 295)`, mặt sau `(3, 304, 500, 297)`. Loại viền trắng/khoảng cách giữa hai mặt và vùng chân dung/vân tay khỏi đặc trưng.
- `docs/card.png`: mẫu chi tiết bổ trợ; chỉ lấy thẻ mặt trước `(113, 86, 408, 260)` và mặt sau `(113, 369, 408, 260)`, loại tiêu đề, chú thích bên ngoài, các mũi tên/đường chú thích và vùng ảnh chân dung/vân tay khỏi đặc trưng.

Mỗi mặt của mỗi mẫu được chuẩn bị ở ba chiều rộng 600/390/240px. ORB lấy đặc trưng cục bộ của chữ in sẵn, quốc huy, hoa văn và chip có trong ảnh; RANSAC cần ít nhất 10 cặp đồng thuận trải trên cả hai chiều để suy ra khung. Phân bố sắc độ và 24 ô màu được rút từ chính mẫu và đối chiếu sau khi nắn phối cảnh. Nhánh đối chiếu điểm đặc trưng kiểm tra nền xanh lam/xanh ngọc (hue 145–225° với dung sai ánh sáng); không ép màu xanh vào ảnh đầu ra. Khối xanh hoặc quốc huy đơn lẻ không đủ để xác nhận.

Nếu dò toàn ảnh không đủ đặc trưng, đường biên/độ sáng/màu xanh đề xuất tối đa 10 vùng khác nhau; từng vùng được chuẩn hóa tỉ lệ và kiểm chứng qua điểm khớp mẫu hoặc tổ hợp bố cục thẻ mô tả bên dưới. Không còn tự chấp nhận hình chữ nhật lớn khi đối chiếu thất bại. Ngưỡng diện tích vùng dò là 0,7% cho ảnh chụp xa. Các bản in đen trắng, thẻ mẫu khác và ảnh quá mất màu có thể bị từ chối theo yêu cầu nhận CCCD nền xanh. Chỉnh góc thủ công vẫn được giữ cho người dùng chủ động quyết định.

Các đặc trưng này là đối chiếu ảnh, không phải mô hình được huấn luyện trên bộ ảnh thực và không xác thực giấy tờ. Không thể suy ra độ dày 0,76 mm, tính thật của phôi bảo an hay nội dung bị mất từ một ảnh chụp phẳng.

Khi góc suy ra vượt ảnh nguồn trong giới hạn 75% mỗi chiều và còn ít nhất 35% diện tích khung thẻ nhìn thấy, phép chiếu phối cảnh bù trắng vùng ngoài ảnh và giữ trắng sau tăng sáng/làm nét. Không sao chép thông tin từ mẫu vào kết quả, không tái tạo chữ hoặc khuôn mặt bị mất. Kích thước đầu ra vẫn 1011 × 638 px ở 300 DPI, khổ 85,60 × 53,98 mm. Nếu đặc trưng không đủ hoặc thẻ quá khác mẫu, việc suy ra góc mất không được bảo đảm; cần kiểm tra kết quả.

### Ảnh thiếu sáng hoặc sáng bạc

Nếu đối chiếu ảnh gốc không thành công, tạo bản phân tích cân bằng sáng bằng phân vị độ chói 1,5%–98,5%, kéo tương phản và gamma có giới hạn. Dùng chung điểm đen/trắng và hệ số tăng sáng cho cả ba kênh để giữ sắc độ, không cân bằng từng kênh hoặc nhuộm xanh. Tìm đặc trưng, màu và vùng đề xuất lại trên bản phân tích; vẫn bắt buộc qua kiểm chứng mẫu hoặc nhiều đặc trưng bố cục. Ảnh xuất được cắt từ ảnh gốc, sau đó cân sáng theo mẫu; không xuất bản phân tích dùng để dò góc. Ảnh phẳng quá tối/cháy trắng không được tạo thêm màu hay chi tiết; vùng đã mất dữ liệu vẫn không khôi phục được.

## Tích hợp AI tìm góc

Đã tích hợp trọng số DocAligner LCNet100 bằng ONNX Runtime Web; xem [luồng xử lý và nguồn tham khảo](../../docs/identify-pipeline.md). Các khung AI được kiểm chứng qua mẫu trước khi xuất. Nhánh đường biên theo jscanify và các bước kiểm tra chất lượng theo kiến trúc vn-identity-card-ocr được giữ trong cùng worker. Không có trọng số YOLO/EfficientNet/VietOCR của repo CCCD trong bản công khai đã kiểm tra; không tuyên bố triển khai các mô hình đó.

### Thẻ bị chụp lẹm nhiều cạnh

Suy ra khung đầy đủ từ homography các điểm khớp còn nhìn thấy; không dùng tỉ lệ thẻ để tự mở rộng một hình bất kỳ. Kiểm tra diện tích bao lồi các điểm khớp (ít nhất 4% mặt mẫu), tránh homography có cực hoặc lật mặt. Nếu mất hơn 20% khung, yêu cầu ít nhất 14 cặp inlier, tỉ lệ inlier 60% và vùng bao lồi 7% mẫu. Góc có thể nằm ngoài ảnh tối đa 75% mỗi chiều nhưng diện tích nhìn thấy, tính bằng cắt đa giác với khung ảnh, phải đạt ít nhất 35%. Một mảnh nhỏ/logo không đủ để suy ra toàn thẻ.

DocAligner chạy thêm hai bản ảnh có vùng trắng ảo 25%/50% xung quanh, rồi quy đổi góc về ảnh nguồn và kiểm chứng như các vùng khác. Đây là thay đổi luồng suy luận, không huấn luyện lại trọng số ONNX. Trình chỉnh sửa giữ được góc âm/vượt 100% và hiển thị chúng trong vùng xem mở rộng; không tự ép góc vào mép ảnh. Kết quả chứa `partial.visibleFraction`/`missingFraction`, luôn bù trắng vùng nguồn không có dữ liệu kể cả sau tăng sáng/làm nét.

Vitest bao gồm mất hai cạnh trái/phải, thẻ dọc bị cắt nhiều ở hai đầu, phối cảnh nghiêng mất cạnh, vùng quá nhỏ phải từ chối, đối chiếu tọa độ homography với ground truth và pixel trắng. Các ảnh kiểm thử là ảnh mô phỏng; không đưa thông tin cá nhân từ ảnh người dùng vào mã nguồn, mẫu hoặc bộ kiểm thử.

Vùng trắng bù được loại khỏi phép đo độ sáng, tương phản, độ mờ và tỷ lệ điểm ảnh rất sáng; tránh coi padding là lóa hoặc tự giảm sáng phần thẻ còn nhìn thấy.

## Thẻ trên giấy trắng hoặc vở kẻ ô

Nhánh `layout` kiểm chứng các vùng đường biên và DocAligner **trước** khi dò điểm khớp toàn ảnh. Nhánh này chỉ áp dụng cho thẻ đủ bốn cạnh nằm trong ảnh; không suy ra phần bị mất bằng bố cục. Ba mẫu chỉ được nạp khi cần nhánh dự phòng ORB/homography hoặc xử lý phần mất cạnh; không chuẩn bị lại đặc trưng cho từng ảnh.

- Mặt trước cần đồng thời: mảng quốc huy đỏ/vàng ở góc trái trên, tiêu đề đỏ đúng vùng, nhiều hàng chữ ở đầu, vùng chân dung có tương phản/texture bên trái và nhiều hàng thông tin bên phải. Không nhận dạng danh tính từ chân dung.
- Mặt sau cần: chip có khung và các đường dẫn điện, ba hàng MRZ có nhiều nhóm nét chữ và khoảng cách phù hợp; thêm ba ô định vị QR đúng bố trí, hai vùng texture vân tay hoặc con dấu. Chỉ đo cấu trúc, không giải mã QR, đọc MRZ hay so sánh vân tay.
- Đo trên bản ảnh gốc và bản cân sáng của vùng thẻ để tránh tăng tương phản làm mất hàng chữ nhỏ. Màu xanh/cool là tín hiệu bổ trợ rộng hơn, không ép ảnh phải giống hệt histogram mẫu. Khối xanh đơn lẻ, một logo/con dấu và trang giấy kẻ ô không đủ để xác nhận.
- Khi dò contour trả danh sách vùng đề xuất, giữ thêm tứ giác hợp lệ khi fit đường thẳng không đủ điểm. Chỉ chấp nhận sau kiểm chứng bên trong vùng, không chọn trang vở vì nó lớn nhất.

`tests/card-layout.test.js` có các ca nền trắng, lưới ô và hình giả luôn chạy. Bốn ảnh người dùng trong `tmp/` được kiểm thử hồi quy khi có trên máy, bỏ qua khi không có; `tmp/` nằm trong `.gitignore`. Không đưa ảnh cá nhân vào mẫu hay tài nguyên phát hành. Kết quả kiểm tra trình duyệt cục bộ ở `/tmp/photocopy-real-results/`.

## Cân sáng ảnh xuất

Đo phân vị độ chói 10%/50%/90% trên nền xanh của mặt trước và mặt sau trong docs/new.png và docs/image.png; cache profile nhỏ trong worker. Dùng trung bình theo mặt để kết quả ổn định khi chỉnh góc hoặc nhánh nhận diện thay đổi. Đường cong độ chói đơn điệu giữ sắc màu với hệ số chung RGB có giới hạn, loại vùng bù trắng và các ô trắng/chân dung/vân tay khỏi phép đo. Không sao chép nội dung từ mẫu. Cân sáng chạy từ ảnh gốc trước điều chỉnh thủ công và làm nét, không tăng sáng chồng khi xử lý lại. Nếu không đủ màu nền thì giữ ảnh; tải mẫu lỗi có cảnh báo. Chi tiết đã mất do cháy sáng/tối không thể khôi phục.

## Nạp công cụ ngay khi vào trang

`IdentifyApp` tạo worker và gọi `warmup()` khi mount: khởi tạo OpenCV, ONNX DocAligner, đặc trưng ảnh mẫu và profile cân sáng, đồng thời nạp module trình chỉnh sửa. Warmup và xử lý ảnh dùng chung hàng đợi/worker; ảnh dán trong lúc chuẩn bị được giữ đến lượt xử lý. Rời trang sẽ hủy worker. Vite optimizeDeps khai báo trước OpenCV, ONNX, Konva và thư viện xuất tài liệu để tránh phát hiện dependency muộn rồi tải lại trang khi người dùng dán ảnh hoặc mở chỉnh sửa.
