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
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.notitest.databinding.ActivityMainBinding
import com.google.firebase.messaging.FirebaseMessaging
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val http = OkHttpClient()
    private var token: String = ""

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
        fetchToken()

        binding.copyButton.setOnClickListener { copyToken() }
        binding.sendButton.setOnClickListener { sendTest() }
    }

    private fun fetchToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                token = task.result ?: ""
                binding.tokenText.text = token
                log("Đã lấy token")
            } else {
                binding.tokenText.text = "Lỗi lấy token: ${task.exception?.message}"
                log("Lỗi lấy token (kiểm tra google-services.json)")
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

    private fun sendTest() {
        if (token.isEmpty()) {
            log("Chưa có token — không gửi được")
            return
        }
        val base = binding.backendUrl.text.toString().trim().trimEnd('/')
        if (base.isEmpty()) {
            log("Hãy nhập Backend URL")
            return
        }
        val url = "$base/api/send"

        val json = JSONObject().apply {
            put("target", JSONObject().apply {
                put("type", "token")
                put("value", token)
            })
            put("notification", JSONObject().apply {
                put("title", binding.titleInput.text.toString())
                put("body", binding.bodyInput.text.toString())
            })
        }
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(url).post(body).build()

        log("Đang gửi tới $url ...")
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread { log("Gửi lỗi: ${e.message}") }
            }

            override fun onResponse(call: Call, response: Response) {
                val text = response.body?.string() ?: ""
                runOnUiThread { log("HTTP ${response.code}: $text") }
            }
        })
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
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun log(msg: String) {
        binding.logText.text = "• $msg\n${binding.logText.text}"
    }
}
