package com.example.notitest

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Nhận message khi app đang mở (foreground) và hiển thị notification thủ công.
 * Khi app ở nền/đóng, payload `notification` được hệ điều hành tự hiển thị nên
 * onMessageReceived không được gọi — không cần xử lý thêm.
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    /**
     * FCM refresh token → token cũ đã đăng ký với notification service thành vô hiệu.
     * Đăng ký lại ngay bằng config đã lưu (nếu user từng bấm "Đăng ký"), vì lúc này không có UI.
     */
    override fun onNewToken(token: String) {
        Backend.loadBearer(this) // process có thể vừa khởi động lại → nạp Bearer từ prefs
        val base = Backend.baseUrl(this)
        val userId = Backend.userId(this)
        if (base.isEmpty() || userId.isEmpty()) return

        Backend.registerDevice(base, userId, token) { ok, detail ->
            Log.i(TAG, if (ok) "re-registered refreshed token: $detail" else "re-register failed: $detail")
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "Notification"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val channelId = getString(R.string.default_notification_channel_id)
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(System.currentTimeMillis().toInt(), notification)
    }

    private companion object {
        const val TAG = "NotiTest"
    }
}
