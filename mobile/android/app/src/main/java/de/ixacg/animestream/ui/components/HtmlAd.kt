package de.ixacg.animestream.ui.components

import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import java.util.UUID
import org.json.JSONObject

private class HtmlAdSizeBridge(private val onResize: (String, Float) -> Unit) {
    @JavascriptInterface
    fun resize(id: String, height: Double) {
        HtmlAdPolicy.measuredHeight(height)?.let { onResize(id, it) }
    }
}

@Composable
fun HtmlAd(
    html: String,
    modifier: Modifier = Modifier,
    dark: Boolean = true,
    width: Int = 0,
    height: Int = 0,
    clickUrl: String = "",
) {
    if (html.isBlank()) return
    val context = LocalContext.current
    val dimensions = HtmlAdPolicy.dimensions(width, height)
    val messageId = remember(html, dark, dimensions, clickUrl) { UUID.randomUUID().toString() }
    val currentMessageId by rememberUpdatedState(messageId)
    var webView by remember { mutableStateOf<WebView?>(null) }
    var measuredHeight by remember { mutableFloatStateOf(72f) }
    val runtime = remember(context) { context.assets.open("html-ad-runtime.js").bufferedReader().use { it.readText() } }
    val document =
        remember(html, dark, dimensions, runtime, messageId, clickUrl) {
            val color = if (dark) "#F1ECE3" else "#1B1B1A"
            val target = JSONObject.quote(clickUrl.trim()).replace("<", "\\u003c")
            val sizing =
                if (dimensions.width > 0) {
                    "width:${dimensions.width}px;height:${dimensions.height}px;overflow:hidden"
                } else {
                    "width:100%;min-height:0"
                }
            """
            <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body{margin:0;padding:0;background:transparent;color:$color;overflow:hidden}
            #hw-ad-content{display:flow-root;position:relative;transform-origin:top left;$sizing}
            img,video{max-width:100%;height:auto}iframe{border:0}a{color:#ffb59f}</style>
            <script>window.__htmlAd={id:'$messageId',width:${dimensions.width},height:${dimensions.height},clickUrl:$target};$runtime</script>
            </head><body><div id="hw-ad-content">$html</div></body></html>
            """.trimIndent()
        }
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val displayWidth = if (dimensions.width > 0) minOf(maxWidth, dimensions.width.dp) else maxWidth
        val displayHeight =
            if (dimensions.width > 0) {
                (displayWidth.value * dimensions.height / dimensions.width).dp
            } else {
                measuredHeight.dp
            }
        AndroidView(
            modifier = Modifier.width(displayWidth).height(minOf(displayHeight, maxHeight)),
            factory = { ctx ->
                WebView(ctx).apply {
                    webView = this
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.setSupportZoom(false)
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    addJavascriptInterface(
                        HtmlAdSizeBridge { id, next ->
                            post { if (webView === this && id == currentMessageId) measuredHeight = next }
                        },
                        "HtmlAdBridge",
                    )
                    webViewClient =
                        object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                if (!request.isForMainFrame) return false
                                if (!request.hasGesture()) return request.url.scheme != "about"
                                return openExternal(request.url)
                            }

                            @Suppress("DEPRECATION")
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                url: String,
                            ): Boolean = openExternal(Uri.parse(url))

                            private fun openExternal(uri: Uri): Boolean {
                                if (uri.scheme !in setOf("http", "https")) return uri.scheme != "about"
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                                return true
                            }
                        }
                    tag = document
                    loadDataWithBaseURL(MediaUrlNormalizer.origin, document, "text/html", "utf-8", null)
                }
            },
            update = { view ->
                if (view.tag != document) {
                    measuredHeight = 72f
                    view.tag = document
                    view.loadDataWithBaseURL(MediaUrlNormalizer.origin, document, "text/html", "utf-8", null)
                }
            },
        )
    }
    DisposableEffect(Unit) {
        onDispose {
            webView?.stopLoading()
            webView?.removeJavascriptInterface("HtmlAdBridge")
            webView?.destroy()
            webView = null
        }
    }
}
