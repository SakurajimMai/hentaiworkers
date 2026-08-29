package de.ixacg.animestream.ui.components

import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import coil.compose.AsyncImage
import coil.request.ImageRequest
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.FeedAdSlot
import de.ixacg.animestream.core.model.MangaSummary
import de.ixacg.animestream.ui.theme.InkRaised

@Composable
fun ScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable () -> Unit = {},
) {
    Row(
        modifier = modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
            }
            Spacer(Modifier.width(4.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        actions()
    }
}

@Composable
fun CatalogSearch(
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = { Text(placeholder) },
        singleLine = true,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { onSubmit() }),
    )
}

@Composable
fun RemoteImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val context = LocalContext.current
    val normalized = remember(url) { MediaUrlNormalizer.normalize(url) }
    Box(modifier = modifier.background(InkRaised), contentAlignment = Alignment.Center) {
        if (normalized == null) {
            Icon(
                Icons.Default.BrokenImage,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(32.dp),
            )
        } else {
            AsyncImage(
                model =
                    ImageRequest.Builder(context)
                        .data(normalized)
                        .crossfade(true)
                        .build(),
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale,
            )
        }
    }
}

@Composable
fun AnimePosterCard(
    anime: Anime,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    removable: Boolean = false,
    onRemove: () -> Unit = {},
) {
    PosterCard(
        title = anime.title,
        subtitle = anime.titleJapanese ?: anime.releaseYear?.toString().orEmpty(),
        image = anime.cover,
        onClick = onClick,
        modifier = modifier,
        removable = removable,
        onRemove = onRemove,
    )
}

@Composable
fun MangaPosterCard(
    manga: MangaSummary,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    removable: Boolean = false,
    onRemove: () -> Unit = {},
) {
    PosterCard(
        title = manga.title,
        subtitle = manga.author ?: "${manga.chapterCount} 话 · ${manga.pageCount} 页",
        image = manga.coverUrl,
        onClick = onClick,
        modifier = modifier,
        removable = removable,
        onRemove = onRemove,
    )
}

@Composable
private fun PosterCard(
    title: String,
    subtitle: String,
    image: String?,
    onClick: () -> Unit,
    modifier: Modifier,
    removable: Boolean,
    onRemove: () -> Unit,
) {
    Column(modifier = modifier.clickable(onClick = onClick)) {
        Box {
            RemoteImage(
                url = image,
                contentDescription = "$title 封面",
                modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(6.dp)),
            )
            if (removable) {
                IconButton(
                    onClick = onRemove,
                    modifier =
                        Modifier.align(Alignment.TopEnd).padding(4.dp).size(48.dp)
                            .background(Color(0xCC0B0D10), RoundedCornerShape(24.dp)),
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "移除 $title")
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (subtitle.isNotBlank()) {
            Text(
                subtitle,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun statePane(
    loading: Boolean,
    error: String?,
    empty: Boolean,
    emptyText: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
): Boolean {
    when {
        loading -> {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = "正在加载" })
            }
            return true
        }
        error != null -> {
            Column(
                modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(error, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRetry, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("重试")
                }
            }
            return true
        }
        empty -> {
            Column(
                modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(emptyText, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onRetry) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("刷新")
                }
            }
            return true
        }
        else -> return false
    }
}

@Composable
fun HtmlAd(
    html: String,
    modifier: Modifier = Modifier,
    dark: Boolean = true,
) {
    if (html.isBlank()) return
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    val foreground = if (dark) "#F1ECE3" else "#1B1B1A"
    val background = if (dark) "#0B0D10" else "transparent"
    val document =
        remember(html, dark) {
            """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body{margin:0;padding:0;background:$background;color:$foreground;overflow:hidden}img,video,iframe{max-width:100%;height:auto}a{color:#ffb59f}</style>
            </head><body>$html</body></html>
            """.trimIndent()
        }
    AndroidView(
        modifier = modifier.fillMaxWidth().heightIn(min = 96.dp, max = 220.dp),
        factory = { ctx ->
            WebView(ctx).apply {
                webView = this
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.setSupportMultipleWindows(false)
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean = openExternal(request.url)

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
                loadDataWithBaseURL(MediaUrlNormalizer.origin, document, "text/html", "utf-8", null)
                tag = document
            }
        },
        update = { view ->
            if (view.tag != document) {
                view.loadDataWithBaseURL(MediaUrlNormalizer.origin, document, "text/html", "utf-8", null)
                view.tag = document
            }
        },
    )
    DisposableEffect(Unit) {
        onDispose {
            webView?.stopLoading()
            webView?.destroy()
            webView = null
        }
    }
}

@Composable
fun FeedAdCard(
    ad: FeedAdSlot,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = InkRaised),
        shape = RoundedCornerShape(6.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    ad.name.ifBlank { "推广" },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (ad.href.isNotBlank()) {
                    IconButton(
                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ad.href))) } },
                        modifier = Modifier.size(48.dp),
                    ) {
                        Icon(Icons.Default.OpenInBrowser, contentDescription = "打开广告链接")
                    }
                }
            }
            if (ad.html.isNotBlank()) HtmlAd(ad.html)
        }
    }
}
