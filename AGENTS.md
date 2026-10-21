# Hướng dẫn dành cho agent

## Ngôn ngữ giao tiếp

- Luôn sử dụng tiếng Việt khi giao tiếp với người dùng trong dự án này, bao gồm cập nhật tiến độ, giải thích, câu hỏi và câu trả lời cuối cùng.
- Giữ nguyên tên biến, tên hàm, đường dẫn, lệnh, mã nguồn và thuật ngữ kỹ thuật khi cần để bảo đảm chính xác.
- Quy định này áp dụng cho toàn bộ dự án và các thư mục con.

## Ngôn ngữ trong giao diện

- Nội dung hiển thị cho người dùng trong các component, trang và layout phải dùng tiếng Việt.
- Áp dụng cho tiêu đề, đoạn văn, nút, liên kết, nhãn trường, placeholder, thông báo lỗi, trạng thái trống, tooltip, văn bản hỗ trợ tiếp cận như `aria-label` và `alt`, cùng tiêu đề trang.
- Khi tạo mới hoặc chỉnh sửa component, viết nội dung giao diện bằng tiếng Việt có dấu.
- Giữ nguyên tên thương hiệu, tên sản phẩm, mã định danh, URL, tên biến, tên hàm, tên prop và các giá trị kỹ thuật cần thiết.

## Sử dụng component giao diện

- Luôn dùng component có sẵn trong `components/ui` cho các điều khiển giao diện tương ứng (nút, trường nhập, hộp thoại và các thành phần khác).
- Tuyệt đối không chỉnh sửa các file trong `components/ui`. Khi cần tùy biến, tạo component bọc trong `components/custom` và tái sử dụng component UI gốc.
- Nút điều hướng dùng Button từ `components/ui/button` với `render` là thẻ liên kết và `nativeButton={false}`, bảo đảm ngữ nghĩa liên kết. Không tự dựng nút HTML bằng cách chỉ sao chép class hoặc gọi `buttonVariants`.
- Các thẻ HTML cấu trúc và nội dung như main, section, div, tiêu đề, đoạn văn vẫn được sử dụng bình thường.

## Quy ước tên file

- Tên file mã nguồn, component, utility và test phải dùng **kebab-case** (chữ thường, phân tách bằng dấu gạch ngang), ví dụ `identify-app.jsx`, `card-editor.jsx`, `image-dropzone.jsx`, `image-source.js`, `identify.test.js`.
- Tên component React vẫn dùng PascalCase; tên biến và hàm vẫn theo quy ước JavaScript phù hợp.
- Khi tạo mới hoặc đổi tên file, cập nhật đầy đủ import và các đường dẫn liên quan.
- Giữ nguyên tên file bắt buộc hoặc theo chuẩn công cụ như `AGENTS.md`, `README.md`, `package.json`, `bun.lock`, các dotfile và file cấu hình quy định bởi framework. Không đổi tên dependency, file sinh tự động hoặc sửa `components/ui` để áp dụng quy tắc này.

## Ngôn ngữ mã nguồn và kiểm thử

- Dự án dùng JavaScript ES Modules: component React là `.jsx`, logic và utility là `.js`, trang Astro là `.astro`. Không tạo file `.ts` hoặc `.tsx` mới.
- Dùng **Vitest** cho unit test và integration test. Không thêm test dùng `bun:test` hoặc trình chạy test khác cho cùng mục đích.
- Dùng Bun để cài đặt dependency và chạy script; script kiểm thử phải gọi Vitest, ví dụ `vitest run` cho một lần chạy và `vitest` cho chế độ theo dõi.
- Test đặt tên `*.test.js` hoặc `*.test.jsx`, phần tên dùng kebab-case. Khi chỉnh sửa test cũ dùng runner khác, chuyển test đó sang Vitest và cập nhật script liên quan.
- Chạy các test liên quan sau thay đổi logic. Không báo kiểm thử thành công nếu chưa thực sự chạy.

## Tổ chức utility dùng chung (`@/utils/`)

Các vai trò dưới đây tương ứng với `constant.ts`, `interface.ts`, `formatter.ts`, `environment.ts` trong dự án TypeScript. Với dự án JavaScript hiện tại, dùng các file `.js` tương ứng, không tạo thêm bản `.ts`.

- `constant.js`: chứa route ổn định, cấu hình điều hướng, giới hạn và các hằng số dạng enum dùng chung; **không bao giờ chứa secret**. Tái sử dụng `appGlobal` cho thông tin ứng dụng.
- `interface.js`: chứa mô tả cấu trúc đối tượng được nhiều module dùng lại, thông qua JSDoc `@typedef`/`@property` và `@import`/`import()` trong JSDoc khi cần. Không đưa logic nghiệp vụ vào file này và không sử dụng cú pháp TypeScript `interface` trong JavaScript.
- `formatter.js`: chứa các phép biến đổi hiển thị chuẩn, thuần túy; mỗi hành vi có một hàm duy nhất để các module tái sử dụng. Không thực hiện I/O, sửa dữ liệu đầu vào hoặc trộn logic nghiệp vụ vào formatter.
- `environment.js`: là đầu mối tập trung đọc và chuẩn hóa toàn bộ biến môi trường ứng dụng được khai báo trong `.env.local`, qua API môi trường của Astro. Các module khác tái sử dụng đầu mối này thay vì tự đọc `.env.local` hoặc rải rác truy cập biến môi trường.
- Kiểm tra và báo rõ bằng tiếng Việt khi thiếu biến môi trường bắt buộc; biến tùy chọn phải có giá trị mặc định phù hợp nếu cần. Không hard-code giá trị bí mật vào mã nguồn, không ghi giá trị bí mật vào log và không commit `.env.local`.
- `environment.js` chứa biến bí mật chỉ được import trong mã server hoặc frontmatter Astro chạy phía server. Không import module chứa secret vào React component, script trình duyệt hoặc worker.
- Nếu phía trình duyệt cần biến môi trường, tách module `environment-client.js` chỉ khai báo rõ từng biến công khai có tiền tố `PUBLIC_`. Không export/spread toàn bộ `import.meta.env` hoặc `process.env` sang client; không chuyển secret qua props, HTML hay API response.
- Không tạo utility trùng chức năng. Chỉ thêm các file utility khi thực sự có dữ liệu hoặc logic dùng chung cần đặt vào đó.

## Tiêu đề trang web

- Title của trang chủ `/` phải lấy trực tiếp từ `appGlobal.name` trong `@/utils/constant.js`.
- Các trang con phải có title theo định dạng `Tên trang | Tên ứng dụng`, trong đó tên ứng dụng luôn lấy từ `appGlobal.name`. Ví dụ: `Biểu ngữ | Photocopy Trường Giang`.
- Trang con chỉ truyền tên trang bằng tiếng Việt qua prop `title` của layout chung; layout chịu trách nhiệm ghép tên ứng dụng. Không hard-code tên ứng dụng hoặc tự ghép hậu tố trong từng trang.
- Mọi trang mới phải sử dụng layout chung để bảo đảm định dạng title nhất quán.

## Biến môi trường bắt buộc qua environment.js

- Bắt buộc dùng `utils/environment.js` làm đầu mối đọc, chuẩn hóa và kiểm tra biến môi trường phía server. Các module ứng dụng khác import module này, không tự đọc `.env.local`, `process.env` hoặc `import.meta.env`. Cấu hình framework và declaration/schema môi trường là ngoại lệ cần thiết.
- Mỗi biến ứng dụng mới phải khai báo tên và giá trị mặc định không bí mật trong `.env.example`; không ghi key thật vào file ví dụ. `.env.local` không được commit.
- Không import `utils/environment.js` từ React component, worker hoặc mã trình duyệt. Không đưa API key vào biến `PUBLIC_*`, HTML, log, thông báo lỗi hay response API.

## Quản lý dependency và file sinh tự động

- Không sửa tay các file lock (`bun.lock`, `bun.lockb`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) hoặc bất kỳ file nào trong `node_modules/`.
- Khi cần cài package, chạy `bun add package-name`; dependency phát triển dùng `bun add -d package-name`. Chỉ để Bun tự cập nhật lockfile và `node_modules`, không vá dependency trực tiếp.
