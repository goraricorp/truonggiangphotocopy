# Luồng xử lý ảnh CCCD

## Các dự án đã tham khảo

- [DocAligner](https://github.com/DocsaidLab/DocAligner), commit `3275b0f07f8e99d8c01cb0774dea2549be1416b6`: triển khai thật mô hình LCNet100 heatmap ONNX. Trọng số 4,54 MiB tải từ file Google Drive chính thức trong `docaligner/heatmap_reg/infer.py`. Mã JavaScript chuyển cách tiền/hậu xử lý sang OpenCV.js; thông tin hash trong `lib/identify/models/doc-aligner-manifest.json`. Giấy phép Apache-2.0 của repo được giữ cạnh mô hình và trong `public/licenses/`. Repo không có giấy phép trọng số riêng được tìm thấy trong lần kiểm tra này.
- [vn-identity-card-ocr](https://github.com/CaoAnhNato/vn-identity-card-ocr), commit `7b98e5ef984f55c9f23f896e67c93c1be0aabddc`: tham khảo cách tách chuẩn hóa, định vị, phối cảnh, chiều xoay và đánh giá chất lượng. Repo công khai không kèm các file YOLO/EfficientNet/VietOCR trong cấu hình và không có liên kết tải trọng số tương ứng được tìm thấy. Không tích hợp YOLO COCO thay thế để giả làm mô hình CCCD, không bổ sung OCR hoặc backend lưu ảnh. Logic ở đây được viết độc lập, không chép mã repo.
- [jscanify](https://github.com/puffinsoft/jscanify): tham khảo bước Canny → Gaussian blur → Otsu → contour → homography. Nhánh `scan` bổ sung các vùng đề xuất khi fitting cạnh không đủ mẫu; vẫn bắt buộc kiểm chứng qua ảnh mẫu. Không dùng quy tắc chọn vật thể lớn nhất để chấp nhận CCCD. Không cài thêm jscanify vì nó dựa vào global `cv`, DOM canvas và không cần thiết cho worker đã có OpenCV.

## Thứ tự thực thi

1. Giải mã EXIF, kiểm tra dung lượng/kích thước và giảm cạnh tối đa về 2400px; giữ tỉ lệ.
2. Tải ONNX Runtime Web và mô hình DocAligner từ cùng origin; ba ảnh mẫu chỉ được tải và trích đặc trưng khi cần nhánh đối chiếu dự phòng. Chạy trong worker với WASM một luồng, không đòi hỏi COOP/COEP hoặc máy chủ Python/GPU. Bộ nhớ mô hình được tái sử dụng tới khi hủy/đóng worker.
3. DocAligner dùng ảnh BGR NCHW float32 `[1,3,256,256] /255` và trả `heatmap [1,4,128,128]`. Lấy centroid contour lớn nhất của từng kênh sau ngưỡng 0,3 và Otsu; thiếu bất kỳ góc nào thì không tạo khung. Chạy toàn ảnh trước; nếu chưa có khung được kiểm chứng bố cục, mới chạy thêm bốn vùng chồng lấn 60% và bản đệm trắng 25%/50% để hỗ trợ thẻ nhỏ hoặc chụp lẹm. Các lượt bổ sung vẫn dùng cùng mô hình và ngưỡng kiểm chứng.
4. Kiểm tra tổ hợp bố cục trong các vùng DocAligner/đường biên trước, nhất là thẻ trên nền trắng hoặc vở kẻ ô; không chấp nhận một màu hoặc logo đơn lẻ. Nếu chưa đạt, đối chiếu đặc trưng ORB/RANSAC trên toàn ảnh và thử cân bằng sáng trung tính.
5. Nắn các vùng AI về ảnh ngang 600 × 378 để đối chiếu đặc trưng và màu với các mẫu tương ứng mặt trước/sau. Nếu chưa đủ, thử vùng đường biên/màu/nhánh scan. Quy đổi kết quả về ảnh gốc bằng homography nghịch, bao gồm ảnh dọc.
6. Bắt buộc hình học hợp lệ và đủ bằng chứng từ điểm khớp mẫu phân bố hai chiều hoặc tổ hợp bố cục mặt trước/mặt sau. AI là bộ tìm vị trí tài liệu tổng quát, không xác thực đó là CCCD; nó không tự vượt qua bước kiểm chứng.
7. Đối chiếu mẫu xác định thứ tự góc theo nội dung, xử lý chiều 0/90/180/270. Không công bố đã dùng mô hình EfficientNet khi không có trọng số đó. Chỉnh góc/xoay thủ công vẫn hoạt động.
8. Cắt từ ảnh nguồn, nắn về 1011 × 638px ở 300 DPI; bù trắng phần nằm ngoài ảnh đã suy ra. Kiểm tra mờ, lóa, phân giải, góc sát mép, phối cảnh và cảnh báo. Không tái tạo nội dung bị mất.

Nếu mô hình không tải/chạy được, tiếp tục nhánh ảnh mẫu/đường biên và báo rõ cảnh báo. Không đổi toàn bộ ảnh gốc thành kết quả thành công khi không phát hiện thẻ. Metadata `method`, `reference`, `cornerConfidence`, `ai.available`, `ai.proposals`, `timings` (mili giây từng bước) phục vụ kiểm chứng; không thêm chi tiết triển khai vào giao diện.

## Kiểm thử và giới hạn

`bun run test:identify` gồm Vitest kiểm tra hình học, mẫu/màu/ánh sáng, ảnh trống, tiền xử lý BGR, giải mã heatmap, SHA-256 và suy luận mô hình ONNX thật. Bản build còn được kiểm tra trong Chromium để xác nhận tải `.onnx`/`.wasm` cùng origin và worker thực sự chạy AI.

Trọng số và WASM làm lần tải xử lý đầu tiên tăng khoảng 19 MiB, chưa kể OpenCV và ảnh mẫu; trình duyệt có thể cache tài nguyên có hash. Khả năng nhận ảnh quá nhỏ, lóa mất chữ, che nhiều góc hoặc lẫn nhiều tài liệu vẫn cần kiểm chứng trên ảnh thực. Các test ghép từ mẫu không thay thế đánh giá trên tập ảnh CCCD chụp thực tế.

Các trường hợp mất nhiều cạnh được xử lý theo [giới hạn suy luận khung và vùng còn nhìn thấy](../lib/identify/README.md#thẻ-bị-chụp-lẹm-nhiều-cạnh); không huấn luyện lại trọng số và không tạo nội dung CCCD đã bị chụp mất.

## Tối ưu thời gian xử lý

- Chạy một lượt AI trước, chỉ mở sáu lượt bổ sung khi cần; không cắt bỏ nhánh dành cho ảnh khó.
- Chỉ tải và chuẩn bị đặc trưng ORB của ba mẫu khi nhánh bố cục chưa xác nhận được thẻ. Bộ đặc trưng và phiên ONNX được giữ trong worker để tái sử dụng.
- Khung có tỷ lệ bị nén/kéo quá nhiều phải qua đối chiếu mẫu; bố cục đơn thuần không đủ phân biệt thẻ nghiêng mạnh với mảnh thẻ mất cạnh.
- Kiểm tra khung theo điểm ưu tiên giảm dần; dừng khi bố cục đã đạt điểm tối đa và các khung còn lại không thể vượt kết quả hiện tại. Không kiểm tra lặp lại các khung đã xét trước khi chuyển sang nhánh ORB.
- Các vòng lặp điểm ảnh giữ tham chiếu bộ nhớ OpenCV trong lượt xử lý, tránh gọi getter cho từng điểm ảnh. Giữ nguyên công thức màu, độ phân giải trung gian tối đa 2400px và đầu ra 1011 × 638px / 300 DPI.

Đo cục bộ trên bốn ảnh thực trong `tmp/` bằng worker của bản build: trước tối ưu lần lượt 23/18/19/16 giây; lượt đo cuối sau tối ưu 8/3/2/5 giây (trung bình nhanh hơn khoảng 4 lần). Tọa độ góc lệch dưới 0,02 pixel so với lượt trước trên cả bốn ảnh. Thời gian phụ thuộc thiết bị, tải CPU, cache và độ khó ảnh; lần đầu còn cần tải/khởi tạo mô hình. Đây là phép đo trên bốn ảnh, không phải cam kết cho mọi ảnh.
