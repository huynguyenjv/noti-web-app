package com.example.notitest

import android.content.Context
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

data class InboxItem(
    val id: String,
    val title: String,
    val body: String,
    val read: Boolean,
    val createdAt: String,
)

/**
 * Client gọi THẲNG các endpoint /api/v1 của vtrip.core.notification, không qua noti-web.
 * App chỉ cần một host duy nhất → phát APK cho người khác chỉ việc trỏ host, không phải dựng web server.
 *
 * Dùng chung cho MainActivity và MyFirebaseMessagingService: service cần đăng ký lại device khi FCM
 * refresh token (lúc đó không có UI), nên host + userId được lưu trong SharedPreferences.
 */
object Backend {

    private const val PREFS = "noti_test"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_USER_ID = "user_id"

    /**
     * POST /api/v1/devices yêu cầu header Authentication. Đây là JWT test dùng chung với noti-web
     * (bản demo chưa gắn IAM); production sẽ lấy từ phiên đăng nhập của user.
     */
    private const val AUTH_TOKEN =
        "Bearer eyJhbGciOiJSUzI1NiJ9.eyJ2aWQiOiIzNDRkNjA2Mi00MzFjLTQ3MWEtYjM3Yi01Yzc3N2NmZWQxNjEiLCJzdWIiOiI4Yjk1OTg2ZC1kY2NkLTQ0ZGQtOGJlOS05OTQwYmFjZmQzZDgiLCJhY3RvclR5cGUiOjIsInZjbWlkIjoiIiwiaXNzIjoiZ3QtYXBwIiwiZXhwIjoxNzk2NTUxODA1LCJ2bXQiOiIiLCJpYXQiOjE3NjQ5OTQyMDUsInByb3YiOiJTWVNURU1fUFJPVklERVIifQ.f1KAy5dowZ5_3QcaMKqwxigJp-sbygbQGvZS5MNNcMc7pYpTT1a4-igUJRnYTUlrgD1RuNDMQ0Z1osJlu1rHcnksOFjrTYCW3cQuT5eqYPnbPiuhKAS8ylKJGLdKkxkdxtC3Psb4Mp2e9bO5MoWtHWvAiv3fwm04xF6ImWvp9W_2is7Mfex28X6eocK0M0Bp1_oG0Bw6Y1_rxPa87M-xtqnViA3wGOLyTP4W5c9tG-q0WYXh-FmfzB1kcz5qdNuNUR2EIOcAiyZMyL5unRx0qp-FWQfBRr4t7hVpy5MG5RsTEZP2K-WMtpeI348RgpMA6fbOYn1xbziI9wwx-HVfnA"

    private val JSON = "application/json".toMediaType()

    private val http = OkHttpClient()

    // SSE giữ kết nối mở → không được timeout khi đọc.
    private val sseHttp = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    fun saveConfig(context: Context, baseUrl: String, userId: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_BASE_URL, baseUrl)
            .putString(KEY_USER_ID, userId)
            .apply()
    }

    fun baseUrl(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_BASE_URL, "") ?: ""

    fun userId(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_USER_ID, "") ?: ""

    fun normalizeBaseUrl(raw: String): String = raw.trim().trimEnd('/')

    /** POST /api/v1/devices — gắn token này vào userId để PUSH tới user đó về được máy này. 201 = OK. */
    fun registerDevice(
        baseUrl: String,
        userId: String,
        token: String,
        onResult: (Boolean, String) -> Unit,
    ) {
        val body = JSONObject()
            .put("platform", "ANDROID")
            .put("token", token)
            .put("userId", userId)

        val req = Request.Builder()
            .url("$baseUrl/api/v1/devices")
            .header("Authentication", AUTH_TOKEN)
            .post(body.toString().toRequestBody(JSON))
            .build()

        call(req) { code, text, err ->
            when {
                err != null -> onResult(false, err)
                code == 201 -> onResult(true, "HTTP 201")
                else -> onResult(false, "HTTP $code: $text")
            }
        }
    }

    /**
     * POST /api/v1/notification — ingest API: recipientId → ContactResolver → fan-out theo channel.
     * Service nhận rồi xử lý bất đồng bộ nên trả 202 (chấp nhận), không phải 200.
     */
    fun notify(
        baseUrl: String,
        recipientId: String,
        channels: List<String>,
        type: String?,
        templateCode: String?,
        locale: String?,
        priority: String?,
        eventRef: String?,
        data: JSONObject?,
        onResult: (Boolean, String) -> Unit,
    ) {
        val ref = eventRef?.takeIf { it.isNotEmpty() } ?: "android-${System.currentTimeMillis()}"
        val body = JSONObject()
            .put("recipientId", recipientId)
            .put("channels", JSONArray(channels))
            .put("templateCode", templateCode?.takeIf { it.isNotEmpty() } ?: "booking_confirmed")
            .put("type", type?.takeIf { it.isNotEmpty() } ?: "BOOKING_CONFIRMED")
            .put("locale", locale?.takeIf { it.isNotEmpty() } ?: "vi")
            .put("priority", priority?.takeIf { it.isNotEmpty() } ?: "HIGH")
            .put("eventRef", ref)
        data?.let { body.put("data", it) }

        val req = Request.Builder()
            .url("$baseUrl/api/v1/notification")
            .post(body.toString().toRequestBody(JSON))
            .build()

        call(req) { code, text, err ->
            when {
                err != null -> onResult(false, err)
                code == 202 || code == 200 -> onResult(true, "HTTP $code · eventRef=$ref")
                else -> onResult(false, "HTTP $code: $text")
            }
        }
    }

    /** GET /api/v1/inbox — hộp thư INAPP. Body bọc trong { data: { items, unreadCount } }. */
    fun inbox(
        baseUrl: String,
        userId: String,
        onResult: (Boolean, List<InboxItem>, Int, String) -> Unit,
    ) {
        val url = urlOf(baseUrl, "/api/v1/inbox") {
            addQueryParameter("userId", userId)
            addQueryParameter("unreadOnly", "false")
            addQueryParameter("limit", "20")
        } ?: return onResult(false, emptyList(), 0, "URL không hợp lệ")

        call(Request.Builder().url(url).get().build()) { code, text, err ->
            if (err != null) return@call onResult(false, emptyList(), 0, err)
            if (code !in 200..299) return@call onResult(false, emptyList(), 0, "HTTP $code: $text")

            val root = parseJson(text)
            val data = root?.optJSONObject("data") ?: root
            val arr = data?.optJSONArray("items") ?: JSONArray()
            val items = (0 until arr.length()).mapNotNull { i ->
                arr.optJSONObject(i)?.let {
                    InboxItem(
                        id = it.optString("id"),
                        title = it.optString("title").ifEmpty { "(không tiêu đề)" },
                        body = it.optString("body"),
                        read = it.optBoolean("read"),
                        createdAt = it.optString("createdAt"),
                    )
                }
            }
            onResult(true, items, data?.optInt("unreadCount") ?: 0, "")
        }
    }

    /** POST /api/v1/inbox/{id}/read — 204 = OK. */
    fun markRead(baseUrl: String, id: String, userId: String, onResult: (Boolean, String) -> Unit) {
        val url = urlOf(baseUrl, "/api/v1/inbox/$id/read") {
            addQueryParameter("userId", userId)
            addQueryParameter("kind", "INBOX")
        } ?: return onResult(false, "URL không hợp lệ")

        val empty = "".toRequestBody(null)
        call(Request.Builder().url(url).post(empty).build()) { code, text, err ->
            when {
                err != null -> onResult(false, err)
                code == 204 || code in 200..299 -> onResult(true, "HTTP $code")
                else -> onResult(false, "HTTP $code: $text")
            }
        }
    }

    /**
     * GET /api/v1/stream (SSE) — mở stream là đánh dấu user "online", nên OUTAPP nudge đến qua stream
     * thay vì push. Presence có TTL ~60s → caller nối lại định kỳ.
     */
    fun openStream(
        baseUrl: String,
        userId: String,
        onOpen: () -> Unit,
        onNotification: (title: String, body: String) -> Unit,
        onClosed: (String) -> Unit,
    ): EventSource? {
        val url = urlOf(baseUrl, "/api/v1/stream") {
            addQueryParameter("userId", userId)
        } ?: return null

        val req = Request.Builder().url(url).header("Accept", "text/event-stream").get().build()
        return EventSources.createFactory(sseHttp).newEventSource(req, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) = onOpen()

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                if (type != "notification") return
                val p = parseJson(data)
                onNotification(
                    p?.optString("title").orEmpty().ifEmpty { "Realtime" },
                    p?.optString("body").orEmpty(),
                )
            }

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                onClosed(t?.message ?: response?.let { "HTTP ${it.code}" } ?: "đóng kết nối")
            }
        })
    }

    private fun urlOf(baseUrl: String, path: String, query: HttpUrl.Builder.() -> Unit): HttpUrl? =
        "$baseUrl$path".toHttpUrlOrNull()?.newBuilder()?.apply(query)?.build()

    /** onResult(code, body, error) — error != null nghĩa là không tới được service. */
    private fun call(req: Request, onResult: (Int, String, String?) -> Unit) {
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onResult(0, "", "không tới được service: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                onResult(response.code, response.body?.string().orEmpty(), null)
            }
        })
    }

    // Service có thể trả HTML/text khi lỗi — parse an toàn thay vì ném exception.
    private fun parseJson(text: String): JSONObject? =
        try {
            JSONObject(text)
        } catch (e: org.json.JSONException) {
            null
        }
}
