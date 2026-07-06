# FCM Notification Tester — Design

## Mục tiêu

Một web app nhỏ để test Firebase Cloud Messaging (FCM) trọn vẹn hai chiều:
- **Nhận:** trình duyệt đăng ký và lấy FCM registration token, hiển thị noti foreground và background.
- **Gửi:** UI có form để đẩy noti tới một token/topic thông qua backend dùng Firebase Admin SDK.

Dùng cho mục đích dev/test nội bộ, không phải sản phẩm production.

## Stack

- Backend: Node.js + Express
- Gửi noti: `firebase-admin` (service account)
- Nhận noti: Firebase JS SDK v9+ (modular) trong trình duyệt + service worker
- Frontend: HTML/CSS/JS thuần (không framework) để giữ nhẹ

## Cấu trúc thư mục

```
noti-web/
├── server.js                       # Express: serve static + API /api/send, /api/config
├── public/
│   ├── index.html                  # UI: token nhận được + form gửi noti + log kết quả
│   ├── app.js                      # Firebase JS SDK: xin quyền, getToken, onMessage
│   └── firebase-messaging-sw.js    # Service worker: nhận noti background
├── .env                            # Service account path + web config (KHÔNG commit)
├── .env.example                    # Mẫu biến môi trường
├── .gitignore
└── package.json
```

## Cấu hình (biến môi trường trong `.env`)

Web config (phía nhận — lấy ở Firebase Console → Project settings → General → Your apps → Web app):
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_VAPID_KEY` — Console → Project settings → Cloud Messaging → Web Push certificates

Service account (phía gửi):
- `GOOGLE_APPLICATION_CREDENTIALS` — đường dẫn tới file service account JSON (Project settings → Service accounts → Generate new private key)

Server:
- `PORT` (mặc định 3000)

## Luồng hoạt động

### Chiều NHẬN (client)
1. Trang load → `app.js` fetch `/api/config` để lấy web config (không nhúng key cứng trong HTML).
2. Khởi tạo Firebase app + messaging, đăng ký `firebase-messaging-sw.js`.
3. Nút "Bật nhận thông báo" → `Notification.requestPermission()` → `getToken({ vapidKey })`.
4. Hiển thị token trên UI kèm nút Copy.
5. `onMessage()` — noti khi tab đang mở → render vào khu vực log/toast trên trang.
6. Service worker `onBackgroundMessage()` — noti khi tab ẩn/đóng → `showNotification()`.

### Chiều GỬI (server)
1. Form: chọn target (token | topic), nhập giá trị target, tiêu đề, nội dung, và optional data (key-value JSON).
2. Submit → `POST /api/send` với payload.
3. `server.js` dùng `firebase-admin` `messaging().send()` để gửi.
4. Trả về `{ ok: true, messageId }` hoặc `{ ok: false, error }`.
5. UI hiển thị kết quả (messageId hoặc lỗi) vào khu vực log.

## API

### `GET /api/config`
Trả về web config (các biến `FIREBASE_*` trừ service account) để client khởi tạo Firebase.
Response: `{ apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey }`

### `POST /api/send`
Request body:
```json
{
  "target": { "type": "token" | "topic", "value": "..." },
  "notification": { "title": "...", "body": "..." },
  "data": { "key": "value" }   // optional
}
```
Response thành công: `{ "ok": true, "messageId": "..." }`
Response lỗi: `{ "ok": false, "error": "mô tả lỗi" }` với HTTP status phù hợp (400/500).

## Xử lý lỗi

- Thiếu quyền notification → UI báo và hướng dẫn bật lại quyền trong trình duyệt.
- `getToken` lỗi (thiếu vapidKey / service worker fail) → hiện thông báo lỗi cụ thể.
- Token hết hạn / không hợp lệ khi gửi → backend bắt lỗi từ `firebase-admin`, trả message rõ ràng.
- Thiếu service account / config → server log cảnh báo khi khởi động và `/api/send` trả lỗi thân thiện.
- Validate input `/api/send`: thiếu title/body/target → 400.

## Kiểm thử

- Test thủ công end-to-end: mở web → lấy token → gửi noti tới chính token đó → thấy noti foreground; ẩn tab → gửi lại → thấy noti background.
- Test `/api/send` bằng payload thiếu field → nhận 400.
- Test gửi với token sai → nhận lỗi rõ ràng.

## Ngoài phạm vi (YAGNI)

- Không có auth/đăng nhập (công cụ dev nội bộ).
- Không lưu lịch sử noti vào database (chỉ log trong phiên trên UI).
- Không quản lý nhiều Firebase project cùng lúc.
- Không đóng gói Docker (có thể thêm sau nếu cần).
