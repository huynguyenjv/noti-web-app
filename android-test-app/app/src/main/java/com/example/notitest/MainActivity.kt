package com.example.notitest

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import com.example.notitest.databinding.ActivityMainBinding
import com.example.notitest.databinding.ItemInboxBinding
import com.google.android.material.chip.Chip
import com.google.firebase.messaging.FirebaseMessaging
import okhttp3.sse.EventSource
import org.json.JSONException
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var token: String = ""
    private var hasLogged = false

    private var sse: EventSource? = null
    private val main = Handler(Looper.getMainLooper())

    // Presence phía service có TTL ~60s → nối lại định kỳ để giữ "online" (giống keepalive bên web).
    private val keepAlive = object : Runnable {
        override fun run() {
            connectStream()
            main.postDelayed(this, KEEPALIVE_MS)
        }
    }

    private val requestPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        log(if (granted) "Đã cấp quyền thông báo" else "CHƯA cấp quyền — noti sẽ không hiện")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        createNotificationChannel()
        askNotificationPermission()
        restoreConfig()
        fetchToken()

        binding.recipientInput.setText(userId())

        // Đổi User ID → hộp thư cũ không còn đúng; realtime phải nối lại theo user mới (giống web).
        binding.userIdInput.doAfterTextChanged {
            binding.recipientInput.setText(userId())
            clearInbox()
            if (sse != null) connectStream()
        }

        binding.copyButton.setOnClickListener { copyToken() }
        binding.registerButton.setOnClickListener { registerDevice() }
        binding.rtButton.setOnClickListener { toggleRealtime() }
        binding.sendButton.setOnClickListener { sendViaNotificationService() }
        binding.inboxRefreshButton.setOnClickListener { loadInbox() }
    }

    override fun onDestroy() {
        stopRealtime()
        super.onDestroy()
    }

    // ------------------------------------------------------------------ config
    private fun restoreConfig() {
        Backend.baseUrl(this).takeIf { it.isNotEmpty() }?.let { binding.backendUrl.setText(it) }
        Backend.userId(this).takeIf { it.isNotEmpty() }?.let { binding.userIdInput.setText(it) }
    }

    private fun userId(): String = binding.userIdInput.text.toString().trim()

    /** Backend URL đã chuẩn hoá; đồng thời lưu lại để service dùng khi FCM refresh token. */
    private fun baseUrl(): String? {
        val base = Backend.normalizeBaseUrl(binding.backendUrl.text.toString())
        if (base.isEmpty()) {
            log("Hãy nhập Backend URL")
            return null
        }
        Backend.saveConfig(this, base, userId())
        return base
    }

    // ------------------------------------------------------------------ device
    private fun fetchToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                token = task.result ?: ""
                binding.tokenText.text = token
                binding.tokenText.setTextColor(ContextCompat.getColor(this, R.color.text_primary))
                setStep(binding.stepToken, done = true)
                log("Đã lấy token")
            } else {
                binding.tokenText.text = "Lỗi lấy token: ${task.exception?.message}"
                log("Lỗi lấy token — kiểm tra google-services.json")
            }
        }
    }

    private fun copyToken() {
        if (token.isEmpty()) {
            Toast.makeText(this, "Chưa có token", Toast.LENGTH_SHORT).show()
            return
        }
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("fcm token", token))
        Toast.makeText(this, "Đã copy token", Toast.LENGTH_SHORT).show()
    }

    /** Đăng ký token cho userId với notification service — giống registerDevice() bên web, platform=ANDROID. */
    private fun registerDevice() {
        val base = baseUrl() ?: return
        if (token.isEmpty()) return log("Chưa có token — không đăng ký được")
        val userId = userId()
        if (userId.isEmpty()) return log("Hãy nhập User ID")

        log("Đang đăng ký device cho user \"$userId\" ...")
        Backend.registerDevice(base, userId, token) { ok, detail ->
            main.post {
                setStep(binding.stepRegistered, done = ok)
                railDone(binding.railA, ok)
                log(if (ok) "ok  Đã đăng ký device cho \"$userId\"." else "err Đăng ký lỗi: $detail")
            }
        }
    }

    // ------------------------------------------------------------------ realtime (SSE)
    private fun toggleRealtime() {
        if (sse != null) {
            stopRealtime()
            log("--  Realtime offline.")
        } else {
            connectStream()
            main.postDelayed(keepAlive, KEEPALIVE_MS)
        }
    }

    private fun connectStream() {
        val base = baseUrl() ?: return
        val userId = userId()
        if (userId.isEmpty()) return log("err Nhập User ID để mở realtime.")

        sse?.cancel()
        setRtStatus("Đang kết nối…")

        sse = Backend.openStream(
            baseUrl = base,
            userId = userId,
            onOpen = {
                main.post {
                    setRtStatus("Online. OUTAPP đến qua realtime thay vì push.")
                    setStep(binding.stepRealtime, done = true, live = true)
                    railDone(binding.railB, true)
                    binding.rtButton.text = "Tắt realtime"
                    log("ok  Realtime online cho \"$userId\".")
                }
            },
            onNotification = { title, body ->
                main.post {
                    log("<<  Realtime nudge: $title — $body")
                    showNotification(title, body)
                }
            },
            onClosed = { reason ->
                main.post {
                    // keepAlive sẽ nối lại; chỉ báo trạng thái nếu user chưa tắt realtime.
                    if (sse != null) setRtStatus("Mất kết nối ($reason). Đang thử lại…")
                }
            },
        )
        if (sse == null) log("err Backend URL không hợp lệ cho realtime.")
    }

    private fun stopRealtime() {
        main.removeCallbacks(keepAlive)
        sse?.cancel()
        sse = null
        setRtStatus("Offline. OUTAPP sẽ đến bằng push.")
        setStep(binding.stepRealtime, done = false)
        railDone(binding.railB, false)
        binding.rtButton.text = "Bật realtime"
    }

    private fun setRtStatus(text: String) {
        binding.rtStatus.text = text
    }

    // ------------------------------------------------------------------ send
    /** POST /api/notify — qua notification service, fan-out theo channel (giống nút Gửi bên web). */
    private fun sendViaNotificationService() {
        val base = baseUrl() ?: return

        val recipientId = binding.recipientInput.text.toString().trim().ifEmpty { userId() }
        if (recipientId.isEmpty()) return log("err Nhập Recipient (User ID).")

        val channels = selectedChannels()
        if (channels.isEmpty()) return log("err Chọn ít nhất 1 channel.")

        val data = parseDataInput().getOrElse { return }

        Backend.notify(
            baseUrl = base,
            recipientId = recipientId,
            channels = channels,
            type = binding.typeInput.text.toString().trim(),
            templateCode = binding.templateInput.text.toString().trim(),
            locale = binding.localeSpinner.selectedItem?.toString(),
            priority = binding.prioritySpinner.selectedItem?.toString(),
            eventRef = binding.eventRefInput.text.toString().trim(),
            data = data,
        ) { ok, detail ->
            main.post {
                if (ok) {
                    log("ok  Đã gửi [${channels.joinToString(",")}] tới \"$recipientId\" ($detail).")
                    // INAPP gửi cho chính user đang xem → làm mới hộp thư.
                    if (channels.contains("INAPP") && recipientId == userId()) loadInbox()
                } else {
                    log("err Gửi lỗi: $detail")
                }
            }
        }
    }

    private fun selectedChannels(): List<String> = buildList {
        fun add(chip: Chip, name: String) { if (chip.isChecked) add(name) }
        add(binding.chPush, "PUSH")
        add(binding.chInapp, "INAPP")
        add(binding.chEmail, "EMAIL")
        add(binding.chSms, "SMS")
        add(binding.chZalo, "ZALO_ZNS")
    }

    /**
     * Ô Data: rỗng → success(null) (không gửi field); JSON hỏng → failure (caller dừng lại).
     * Phải phân biệt hai ca này, nếu không data rỗng sẽ bị coi là lỗi.
     */
    private fun parseDataInput(): Result<JSONObject?> {
        val raw = binding.dataInput.text.toString().trim()
        if (raw.isEmpty()) return Result.success(null)
        return try {
            Result.success(JSONObject(raw))
        } catch (e: JSONException) {
            log("err Data không phải JSON hợp lệ.")
            Result.failure(e)
        }
    }

    // ------------------------------------------------------------------ inbox
    private fun loadInbox() {
        val base = baseUrl() ?: return
        val userId = userId()
        if (userId.isEmpty()) return log("err Nhập User ID để xem hộp thư.")

        Backend.inbox(base, userId) { ok, items, unread, err ->
            main.post {
                if (!ok) return@post log("err Tải hộp thư lỗi: $err")
                renderInbox(items)
                setBadge(unread)
                log("--  Hộp thư \"$userId\": ${items.size} tin, $unread chưa đọc.")
            }
        }
    }

    private fun clearInbox() {
        binding.inboxContainer.removeAllViews()
        setBadge(0)
    }

    private fun setBadge(unread: Int) {
        binding.badgeText.text = "$unread chưa đọc"
        binding.badgeText.setBackgroundResource(
            if (unread > 0) R.drawable.bg_step_signal else R.drawable.bg_step_idle
        )
        binding.badgeText.setTextColor(
            ContextCompat.getColor(this, if (unread > 0) R.color.signal else R.color.text_faint)
        )
    }

    private fun renderInbox(items: List<InboxItem>) {
        binding.inboxContainer.removeAllViews()
        if (items.isEmpty()) {
            val empty = ItemInboxBinding.inflate(layoutInflater, binding.inboxContainer, true)
            empty.itemTitle.text = "Chưa có tin nào"
            empty.itemBody.text = "Gửi một notification với channel INAPP để thấy nó ở đây."
            empty.itemDot.visibility = android.view.View.GONE
            return
        }
        for (item in items) {
            val row = ItemInboxBinding.inflate(layoutInflater, binding.inboxContainer, true)
            row.itemTitle.text = item.title
            row.itemBody.text = item.body
            row.itemMeta.text = if (item.read) "đã đọc · ${item.createdAt}" else "chạm để đánh dấu đã đọc · ${item.createdAt}"
            row.itemDot.visibility = if (item.read) android.view.View.INVISIBLE else android.view.View.VISIBLE
            if (!item.read) row.root.setOnClickListener { markRead(item) }
        }
    }

    private fun markRead(item: InboxItem) {
        val base = baseUrl() ?: return
        Backend.markRead(base, item.id, userId()) { ok, detail ->
            main.post {
                if (ok) {
                    log("ok  Đã đánh dấu đã đọc: ${item.title}")
                    loadInbox()
                } else {
                    log("err Đánh dấu đã đọc lỗi: $detail")
                }
            }
        }
    }

    // ------------------------------------------------------------------ thanh pipeline
    /**
     * Ba bước bắt buộc theo đúng thứ tự: có token → đăng ký với service → (tuỳ chọn) realtime.
     * Chỉ bật khi trạng thái thật sự đạt được, nên nhìn thanh này là biết đang kẹt ở đâu.
     */
    private fun setStep(step: TextView, done: Boolean, live: Boolean = false) {
        val bg = when {
            !done -> R.drawable.bg_step_idle
            live -> R.drawable.bg_step_live
            else -> R.drawable.bg_step_signal
        }
        val fg = when {
            !done -> R.color.text_faint
            live -> R.color.live
            else -> R.color.signal
        }
        step.setBackgroundResource(bg)
        step.setTextColor(ContextCompat.getColor(this, fg))
    }

    private fun railDone(rail: android.view.View, done: Boolean) {
        rail.setBackgroundColor(
            ContextCompat.getColor(this, if (done) R.color.signal else R.color.border)
        )
    }

    // ------------------------------------------------------------------ misc
    private fun showNotification(title: String, body: String) {
        val notification = NotificationCompat.Builder(this, getString(R.string.default_notification_channel_id))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        getSystemService(NotificationManager::class.java)
            .notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                getString(R.string.default_notification_channel_id),
                "Noti Test",
                NotificationManager.IMPORTANCE_HIGH
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun log(msg: String) {
        if (!hasLogged) {
            hasLogged = true
            binding.logText.text = ""
            binding.logText.setTextColor(ContextCompat.getColor(this, R.color.text_primary))
        }
        binding.logText.text = "› $msg\n${binding.logText.text}"
    }

    private companion object {
        const val KEEPALIVE_MS = 45_000L
    }
}
