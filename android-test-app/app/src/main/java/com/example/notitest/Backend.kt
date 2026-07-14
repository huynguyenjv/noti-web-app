package com.example.notitest

import android.content.Context
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
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
 * Client của noti-web backend — mirror các luồng bên web (public/app.js):
 * register-device, notify (ingest API), inbox, stream (SSE presence) và send (FCM trực tiếp).
 *
 * Dùng chung cho MainActivity và MyFirebaseMessagingService: service cần đăng ký lại device khi FCM
 * refresh token (lúc đó không có UI), nên backend URL + userId được lưu trong SharedPreferences.
 */
object Backend {

    private const val PREFS = "noti_test"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_USER_ID = "user_id"

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

    /**
     * POST /api/register-device — báo notification service biết token này thuộc userId nào, để PUSH
     * tới userId đó tới được máy này. Giống registerDevice() bên web, khác mỗi platform = ANDROID.
     */
    fun registerDevice(
        baseUrl: String,
        userId: String,
        token: String,
        onResult: (Boolean, String) -> Unit,
    ) {
        val body = JSONObject()
            .put("userId", userId)
            .put("token", token)
            .put("platform", "ANDROID")
        post("$baseUrl/api/register-device", body) { ok, json, detail ->
            onResult(ok, if (ok) detail else (json?.optString("error").orEmpty().ifEmpty { detail }))
        }
    }

    /**
     * POST /api/notify — gửi QUA notification service (ingest API): recipientId → ContactResolver →
     * fan-out theo channel. Khác /api/send (bắn thẳng FCM tới 1 token qua firebase-admin).
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
        val body = JSONObject()
            .put("recipientId", recipientId)
            .put("channels", JSONArray(channels))
        // Bỏ field rỗng để server dùng default (giống `|| undefined` bên web).
        type?.takeIf { it.isNotEmpty() }?.let { body.put("type", it) }
        templateCode?.takeIf { it.isNotEmpty() }?.let { body.put("templateCode", it) }
        locale?.takeIf { it.isNotEmpty() }?.let { body.put("locale", it) }
        priority?.takeIf { it.isNotEmpty() }?.let { body.put("priority", it) }
        eventRef?.takeIf { it.isNotEmpty() }?.let { body.put("eventRef", it) }
        data?.let { body.put("data", it) }

        post("$baseUrl/api/notify", body) { ok, json, detail ->
            if (ok) onResult(true, "eventRef=${json?.optString("eventRef").orEmpty()}")
            else onResult(false, json?.optString("error").orEmpty().ifEmpty { detail })
        }
    }

    /** POST /api/send — backend bắn FCM thẳng về token này (self-test, không qua notification service). */
    fun send(baseUrl: String, body: JSONObject, onResult: (Boolean, String) -> Unit) {
        post("$baseUrl/api/send", body) { ok, json, detail ->
            if (ok) onResult(true, "messageId=${json?.optString("messageId").orEmpty()}")
            else onResult(false, json?.optString("error").orEmpty().ifEmpty { detail })
        }
    }

    /** GET /api/inbox?userId= — hộp thư INAPP. */
    fun inbox(
        baseUrl: String,
        userId: String,
        onResult: (Boolean, List<InboxItem>, Int, String) -> Unit,
    ) {
        val url = "$baseUrl/api/inbox".toHttpUrlOrNull()
            ?.newBuilder()
            ?.addQueryParameter("userId", userId)
            ?.build()
        if (url == null) {
            onResult(false, emptyList(), 0, "Backend URL không hợp lệ")
            return
        }
        http.newCall(Request.Builder().url(url).get().build()).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onResult(false, emptyList(), 0, "lỗi mạng: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val text = response.body?.string().orEmpty()
                val json = parseJson(text)
                if (!response.isSuccessful || json == null || !json.optBoolean("ok")) {
                    val err = json?.optString("error").orEmpty().ifEmpty { "HTTP ${response.code}: $text" }
                    onResult(false, emptyList(), 0, err)
                    return
                }
                val arr = json.optJSONArray("items") ?: JSONArray()
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
                onResult(true, items, json.optInt("unreadCount"), "")
            }
        })
    }

    /** POST /api/inbox/{id}/read — đánh dấu 1 tin đã đọc. */
    fun markRead(baseUrl: String, id: String, userId: String, onResult: (Boolean, String) -> Unit) {
        val body = JSONObject().put("userId", userId)
        post("$baseUrl/api/inbox/$id/read", body) { ok, json, detail ->
            onResult(ok, if (ok) detail else json?.optString("error").orEmpty().ifEmpty { detail })
        }
    }

    /**
     * GET /api/stream?userId= (SSE) — mở stream là đánh dấu user "online", nên OUTAPP nudge sẽ đến
     * qua stream thay vì push. Presence phía service có TTL ~60s → caller nối lại định kỳ.
     */
    fun openStream(
        baseUrl: String,
        userId: String,
        onOpen: () -> Unit,
        onNotification: (title: String, body: String) -> Unit,
        onClosed: (String) -> Unit,
    ): EventSource? {
        val url = "$baseUrl/api/stream".toHttpUrlOrNull()
            ?.newBuilder()
            ?.addQueryParameter("userId", userId)
            ?.build() ?: return null

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

    private fun post(url: String, body: JSONObject, onResult: (Boolean, JSONObject?, String) -> Unit) {
        val req = Request.Builder()
            .url(url)
            .post(body.toString().toRequestBody(JSON))
            .build()
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onResult(false, null, "lỗi mạng: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val text = response.body?.string().orEmpty()
                val json = parseJson(text)
                val ok = response.isSuccessful && json?.optBoolean("ok") == true
                onResult(ok, json, "HTTP ${response.code}: $text")
            }
        })
    }

    // Server có thể trả HTML (vd 404 khi chưa restart) — parse an toàn thay vì ném exception.
    private fun parseJson(text: String): JSONObject? =
        try {
            JSONObject(text)
        } catch (e: org.json.JSONException) {
            null
        }
}
