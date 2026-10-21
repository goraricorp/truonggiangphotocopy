# Triển khai

## Vercel

- Framework Preset: Astro; Build Command: `bun run build`. Để Output Directory theo mặc định của framework, không ghi đè thành `dist`.
- Vercel đặt `VERCEL=1`; cấu hình tự dùng `@astrojs/vercel`, sinh `.vercel/output` chứa trang tĩnh và function `/api/gemini`.
- Node.js: 24.x. Function có thời gian chạy tối đa 180 giây; giới hạn thực tế còn phụ thuộc gói Vercel.
- Khai báo các biến trong `.env.example` tại Settings → Environment Variables, chọn Production/Preview phù hợp rồi redeploy. Không commit `.env.local` hoặc `.env.production`.
- Kiểm tra `/`, `/identify`, `/generator`, `/statement` và `/api/gemini` sau deploy. API trạng thái chỉ trả cấu hình công khai, không trả API key.

## Node độc lập

Khi không có `VERCEL=1`, `bun run build` vẫn sinh server Node. Chạy bằng `bun run start`.
