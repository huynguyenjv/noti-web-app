# Android FCM Test App — Design

Date: 2026-07-09

## Mục tiêu
Một app Android tối giản (1 màn hình) để xác nhận backend `noti-web` đẩy được push
notification xuống thiết bị Android thật. Deliverable: file `app-debug.apk` cài trực
tiếp lên máy, PO tự test không cần dev tool.

## Luồng test (PO tự thao tác)
1. Cài `app-debug.apk` (đã nhúng `google-services.json` của Firebase project hiện có).
2. Mở app → cấp quyền thông báo → app hiện **device token FCM**.
3. Bấm **Gửi test** → app gọi HTTP `POST {backendURL}/api/send` với token của chính nó.
4. Backend noti-web (giữ service account) gửi FCM → noti hiện trên máy. ✅

Không nhét service account vào app — app chỉ là phía "nhận" + trigger qua backend.

## Kiến trúc / thành phần
- **Ngôn ngữ:** Kotlin, project Gradle chuẩn, thư mục `android-test-app/` trong repo.
- **MainActivity (1 màn hình):**
  - Hiện device token + nút **Copy**.
  - Ô **Backend URL** (điền sẵn, sửa được → sau này trỏ sang notification hub).
  - Ô **Title** + **Body** (mẫu sẵn).
  - Nút **Gửi test** → POST `{backendURL}/api/send`
    body `{ target:{type:"token", value:<token>}, notification:{title, body} }`.
  - Khu **Log**: kết quả gửi + noti nhận foreground.
- **MyFirebaseMessagingService:** hiển thị/log khi app foreground. App ở nền: backend
  gửi payload `notification` (xem `lib/sender.js`) nên Android tự hiện, không cần code thêm.
- **Firebase:** thêm 1 Android app vào Firebase project hiện có → `google-services.json`
  đặt vào `app/`. Không đụng cấu hình web đang chạy.

## Backend
Không sửa noti-web. Endpoint `/api/send` sẵn có nhận đúng format. Điều kiện: backend phải
chạy ở URL điện thoại truy cập được (deploy HTTPS hoặc tunnel ngrok — cấu hình sau).

## Quyền & tương thích
- Android 13+ xin runtime `POST_NOTIFICATIONS` khi mở app.
- `minSdk` 24, `targetSdk` 34, package `com.example.notitest`.

## Build (command-line, không cần Android Studio)
JDK 17 + Android command-line tools + platform/build-tools 34 + Gradle.
Build: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.

## Success criteria
Cài APK lên máy thật → mở → cấp quyền → bấm Gửi test (backend reachable) → noti hiện.
Kiểm tra cả foreground (app mở) và background (app đóng).
