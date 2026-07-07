# FCM Notification Tester

Web nhỏ để test Firebase Cloud Messaging: lấy FCM token trong trình duyệt, nhận noti (foreground + background), và gửi noti qua backend dùng Firebase Admin SDK.

## Yêu cầu
- Node.js >= 18
- Một Firebase project có bật Cloud Messaging

## Cài đặt
```bash
npm install
cp .env.example .env
```

Điền `.env`:
- `FIREBASE_*`: Firebase Console → Project settings → General → Your apps → Web app config.
- `FIREBASE_VAPID_KEY`: Project settings → Cloud Messaging → Web Push certificates → Key pair.
- `GOOGLE_APPLICATION_CREDENTIALS`: đường dẫn tới service account JSON (Project settings → Service accounts → Generate new private key).

## Chạy
```bash
npm start
```
Mở http://localhost:3000

chrome://gcm-internals/

## Cách test
1. Bấm **Bật nhận thông báo**, cho phép quyền → token hiện ra, bấm **Copy token**.
2. Dán token vào ô **Target value**, nhập tiêu đề + nội dung, bấm **Gửi notification**.
3. Tab đang mở → noti hiện trong Log (foreground). Ẩn/đóng tab rồi gửi lại → noti hệ điều hành (background qua service worker).

## Lưu ý
- Cần chạy trên `localhost` hoặc HTTPS (yêu cầu của service worker + FCM web).
- Không commit `.env` hay service account JSON.

## Test
```bash
npm test
```
