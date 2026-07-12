# Noti Test — App Android test push FCM

App tối giản để test backend `noti-web` đẩy push notification xuống thiết bị Android thật.

- Hiện **device token FCM** (copy được).
- Nút **Gửi test** → gọi `POST {Backend URL}/api/send` với token của chính máy → backend gửi FCM về lại → noti hiện.
- Nhận noti cả khi app đang mở (foreground) lẫn khi app đóng (background).

Package: `com.example.notitest`

---

## 1. Đăng ký app Android trong Firebase (bắt buộc)

Dùng đúng Firebase project mà `noti-web` đang gửi.

1. [Firebase Console](https://console.firebase.google.com/) → chọn project → **Project settings** → tab **General** → **Your apps** → **Add app** → chọn **Android**.
2. **Android package name**: nhập chính xác `com.example.notitest`.
3. Bấm **Register app** → **Download google-services.json**.
4. Đặt file vào: `android-test-app/app/google-services.json`.

> Không cần build lại backend hay đổi gì bên web — token Android và token web đều gửi qua cùng Admin SDK.

---

## 2. Cài công cụ build (Windows, không cần Android Studio)

### 2.1. JDK 17
Tải Temurin JDK 17: https://adoptium.net/temurin/releases/?version=17
Cài xong, kiểm tra trong PowerShell:
```powershell
java -version   # phải hiện 17.x
```

### 2.2. Android command-line tools
1. Tải "Command line tools only" (Windows): https://developer.android.com/studio#command-line-tools-only
2. Giải nén vào ví dụ `C:\Android\cmdline-tools`, rồi sắp xếp lại thành:
   `C:\Android\cmdline-tools\latest\bin\...` (thư mục `latest` là bắt buộc).
3. Đặt biến môi trường (PowerShell, session hiện tại):
   ```powershell
   $env:ANDROID_HOME = "C:\Android"
   $env:Path += ";C:\Android\cmdline-tools\latest\bin"
   ```
   (Để lâu dài thì thêm vào System Environment Variables.)
4. Cài SDK cần thiết + chấp nhận license:
   ```powershell
   sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   sdkmanager --licenses
   ```

### 2.3. Gradle 8.7
Tải Gradle 8.7 (binary): https://gradle.org/releases/
Giải nén, thêm `...\gradle-8.7\bin` vào `Path`:
```powershell
$env:Path += ";C:\Gradle\gradle-8.7\bin"
gradle -v   # kiểm tra
```

---

## 3. Build APK

Từ thư mục `android-test-app`:

```powershell
# lần đầu: tạo gradle wrapper để build ổn định về sau
gradle wrapper --gradle-version 8.7

# build APK debug
.\gradlew.bat assembleDebug
```

APK nằm ở:
```
android-test-app\app\build\outputs\apk\debug\app-debug.apk
```

> Nếu Gradle không tìm thấy SDK, tạo file `android-test-app/local.properties` với dòng:
> `sdk.dir=C\:\\Android`

---

## 4. Cài & test trên điện thoại

1. Copy `app-debug.apk` sang điện thoại (USB / Drive / Zalo...).
2. Mở file → cho phép **Cài từ nguồn không xác định** → cài.
3. Mở app **Noti Test** → cấp quyền thông báo → token hiện ra.
4. Nhập **Backend URL** (URL noti-web mà điện thoại truy cập được — xem mục 5) → bấm **Gửi test**.
5. Noti hiện lên → push hoạt động. ✅

Cách khác: bấm **Copy token**, dán vào ô Target của web noti-web rồi gửi từ web.

---

## 5. Backend URL cần reachable từ điện thoại

`http://localhost:3000` trên máy tính thì điện thoại **không** thấy. Chọn 1 cách:

- **Tunnel nhanh:** `npx ngrok http 3000` → dùng URL `https://xxxx.ngrok.io`.
- **Cùng mạng LAN:** dùng `http://<IP-máy-tính>:3000` (đã bật `usesCleartextTraffic` nên http chạy được để test).
- **Emulator:** `http://10.0.2.2:3000` (giá trị điền sẵn trong app).
- **Sau này:** trỏ thẳng sang URL notification hub của bạn — chỉ cần sửa ô Backend URL, không build lại.
