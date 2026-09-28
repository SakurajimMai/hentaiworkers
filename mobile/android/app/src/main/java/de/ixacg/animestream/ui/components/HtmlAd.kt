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
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import java.util.UUID
import kotlin.math.roundToInt
import org.json.JSONObject

private class HtmlAdSizeBridge(
    private val allowZero: Boolean,
    private val onResize: (String, Float) -> Unit,
) {
    @JavascriptInterface
    fun resize(
        id: String,
        height: Double,
    ) {
        HtmlAdPolicy.measuredHeight(height, allowZero)?.let { onResize(id, it) }
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
    fitParent: Boolean = false,
    contain: Boolean = false,
    // The creative pins itself to the viewport (悬浮): follow the area it covers, 0 once closed.
    floating: Boolean = false,
    onHeightChange: ((Float) -> Unit)? = null,
) {
    if (html.isBlank()) return
    val context = LocalContext.current
    val dimensions = if (floating) HtmlAdPolicy.Dimensions() else HtmlAdPolicy.dimensions(width, height)
    val messageId = remember(html, dark, dimensions, clickUrl, fill, floating) { UUID.randomUUID().toString() }
    val currentMessageId by rememberUpdatedState(messageId)
    val currentOnHeightChange by rememberUpdatedState(onHeightChange)
    var webView by remember { mutableStateOf<WebView?>(null) }
    // A floating unit starts 1dp tall: it needs a laid-out viewport before it can be measured.
    val initialHeight = if (floating) 1f else 72f
    var measuredHeight by remember { mutableFloatStateOf(initialHeight) }
    LaunchedEffect(measuredHeight) { currentOnHeightChange?.invoke(measuredHeight) }
    val runtime = remember(context) { context.assets.open("html-ad-runtime.js").bufferedReader().use { it.readText() } }
    val document =
        remember(html, dark, dimensions, runtime, messageId, clickUrl, fill, floating) {
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
            <script>window.__htmlAd={id:'$messageId',width:${dimensions.width},height:${dimensions.height},clickUrl:$target,fill:${if (fill) "true" else "false"},floating:${if (floating) "true" else "false"}};$runtime</script>
            </head><body><div id="hw-ad-content">$html</div></body></html>
            """.trimIndent()
        }
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val fixed = dimensions.width > 0
        val boundedHeight = maxHeight != Dp.Unspecified && maxHeight != Dp.Infinity
        val scale =
            if (fixed) {
                HtmlAdPolicy.fitScale(
                    slotWidth = maxWidth.value,
                    slotHeight = if (contain && boundedHeight) maxHeight.value else null,
                    creative = dimensions,
                    allowUpscale = fitParent || contain,
                )
            } else {
                1f
            }
        val displayWidth = if (fixed) minOf(maxWidth, dimensions.width.dp * scale) else maxWidth
        val fillParent = !floating && (fill || (!fixed && boundedHeight))
        val displayHeight =
            if (fixed) {
                dimensions.height.dp * scale
            } else if (fillParent && boundedHeight) {
                maxHeight
            } else if (floating) {
                HtmlAdPolicy.floatingFrameHeight(measuredHeight).dp
            } else {
                measuredHeight.dp
            }
        val boxHeight = if (boundedHeight) minOf(displayHeight, maxHeight) else displayHeight
        val viewModifier =
            if (fixed) {
                Modifier.scaledCreative(dimensions.width.dp, dimensions.height.dp, scale)
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
                            HtmlAdSizeBridge(allowZero = floating) { id, next ->
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
                        measuredHeight = initialHeight
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

/**
 * Measure the creative at its native CSS-pixel size so alliance scripts still see e.g. 300x250,
 * then report only the scaled footprint to the parent and draw it scaled from the top-left.
 * `requiredSize` + `graphicsLayer` would centre the oversized WebView inside the smaller slot
 * before scaling, which pushed narrowed banners up and left out of their box.
 */
private fun Modifier.scaledCreative(
    width: Dp,
    height: Dp,
    scale: Float,
): Modifier =
    layout { measurable, _ ->
        val placeable = measurable.measure(Constraints.fixed(width.roundToPx(), height.roundToPx()))
        layout((placeable.width * scale).roundToInt(), (placeable.height * scale).roundToInt()) {
            placeable.placeWithLayer(0, 0) {
                scaleX = scale
                scaleY = scale
                transformOrigin = TransformOrigin(0f, 0f)
            }
        }
    }
