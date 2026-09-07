package de.ixacg.animestream.ui.components

import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import java.util.UUID
import org.json.JSONObject

private class HtmlAdSizeBridge(private val onResize: (String, Float) -> Unit) {
    @JavascriptInterface
    fun resize(
        id: String,
        height: Double,
    ) {
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
    fill: Boolean = false,
) {
    if (html.isBlank()) return
    val context = LocalContext.current
    val dimensions = HtmlAdPolicy.dimensions(width, height)
    val messageId = remember(html, dark, dimensions, clickUrl, fill) { UUID.randomUUID().toString() }
    val currentMessageId by rememberUpdatedState(messageId)
    var webView by remember { mutableStateOf<WebView?>(null) }
    var measuredHeight by remember { mutableFloatStateOf(72f) }
    val runtime = remember(context) { context.assets.open("html-ad-runtime.js").bufferedReader().use { it.readText() } }
    val document =
        remember(html, dark, dimensions, runtime, messageId, clickUrl, fill) {
            val color = if (dark) "#F1ECE3" else "#1B1B1A"
            val target = JSONObject.quote(clickUrl.trim()).replace("<", "\\u003c")
            val sizing =
                if (dimensions.width > 0) {
                    "width:${dimensions.width}px;height:${dimensions.height}px;overflow:hidden"
                } else {
                    "width:100%;height:100%;min-height:0"
                }
            """
            <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;color:$color;overflow:hidden}
            #hw-ad-content{display:flow-root;position:relative;transform-origin:top left;$sizing}
            img,video,iframe,ins{max-width:100%}iframe{border:0}a{color:#ffb59f}</style>
            <script>window.__htmlAd={id:'$messageId',width:${dimensions.width},height:${dimensions.height},clickUrl:$target,fill:${if (fill) "true" else "false"}};$runtime</script>
            </head><body><div id="hw-ad-content">$html</div></body></html>
            """.trimIndent()
        }
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val fixed = dimensions.width > 0
        val displayWidth = if (fixed) minOf(maxWidth, dimensions.width.dp) else maxWidth
        val scale = if (fixed) (displayWidth / dimensions.width.dp).coerceAtMost(1f) else 1f
        val boundedHeight = maxHeight != Dp.Unspecified && maxHeight != Dp.Infinity
        val fillParent = fill || (!fixed && boundedHeight)
        val displayHeight =
            if (fixed) {
                dimensions.height.dp * scale
            } else if (fillParent && boundedHeight) {
                maxHeight
            } else {
                measuredHeight.dp
            }
        val boxHeight = if (boundedHeight) minOf(displayHeight, maxHeight) else displayHeight
        val viewModifier =
            if (fixed) {
                Modifier
                    .requiredSize(dimensions.width.dp, dimensions.height.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        transformOrigin = TransformOrigin(0f, 0f)
                    }
            } else {
                Modifier.width(displayWidth).height(boxHeight)
            }
        Box(
            Modifier
                .width(displayWidth)
                .height(boxHeight)
                .clipToBounds(),
        ) {
            AndroidView(
                modifier = viewModifier,
                factory = { ctx ->
                    WebView(ctx).apply {
                        webView = this
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        isVerticalScrollBarEnabled = false
                        isHorizontalScrollBarEnabled = false
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.useWideViewPort = false
                        settings.loadWithOverviewMode = false
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
                        val frameUrl = "${MediaUrlNormalizer.origin}/ads/html"
                        loadDataWithBaseURL(frameUrl, document, "text/html", "utf-8", frameUrl)
                    }
                },
                update = { view ->
                    if (view.tag != document) {
                        measuredHeight = 72f
                        view.tag = document
                        val frameUrl = "${MediaUrlNormalizer.origin}/ads/html"
                        view.loadDataWithBaseURL(frameUrl, document, "text/html", "utf-8", frameUrl)
                    }
                },
            )
        }
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
