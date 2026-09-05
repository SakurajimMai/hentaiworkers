package de.ixacg.animestream.reader

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.imageLoader
import coil.request.ImageRequest
import de.ixacg.animestream.core.model.MangaChapterSummary
import de.ixacg.animestream.core.model.MangaPage
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.HtmlAd
import de.ixacg.animestream.ui.library.formatChapter
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.coil.ZoomableAsyncImage
import me.saket.telephoto.zoomable.rememberZoomableImageState
import me.saket.telephoto.zoomable.rememberZoomableState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    mangaId: Long,
    chapterNumber: Double,
    initialPage: Int,
    readerRequestId: String,
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
    onChapter: (Double) -> Unit,
) {
    val state by viewModel.reader.collectAsStateWithLifecycle()
    val adsState by viewModel.adsState.collectAsStateWithLifecycle()
    val ads = adsState.config
    val content = state.value?.takeIf { it.manga.id == mangaId && it.chapter.number == chapterNumber }
    val pages = content?.chapter?.pages.orEmpty()
    val nextChapter = content?.nextChapter
    val chapterKey = content?.let { "${it.manga.id}:${it.chapter.id}:${it.chapter.number}" }
    var displayedPages by remember(readerRequestId, chapterKey) { mutableStateOf(emptySet<Int>()) }
    var visibleReaderPages by remember(readerRequestId, chapterKey) { mutableStateOf(setOf(initialPage)) }
    var readerReady by remember(readerRequestId, chapterKey) { mutableStateOf(false) }
    val topAdEnabled = readerReady && ads.reader.top.enabled && ads.reader.top.html.isNotBlank()
    val pageStartIndex = if (topAdEnabled) 1 else 0
    val initialListIndex =
        content?.let {
            ReaderLogic.initialItemIndex(
                restoredPage = initialPage,
                pageCount = pages.size,
                hasTopAd = topAdEnabled,
            )
        } ?: 0
    val listState =
        key(readerRequestId, chapterKey, initialPage) {
            rememberLazyListState(initialFirstVisibleItemIndex = initialListIndex)
        }
    val scope = rememberCoroutineScope()
    var chromeVisible by remember { mutableStateOf(true) }
    var chapterSheetVisible by remember { mutableStateOf(false) }
    var sliderValue by remember { mutableFloatStateOf(initialPage.toFloat()) }
    var sliderDragging by remember { mutableStateOf(false) }
    var seekJob by remember { mutableStateOf<Job?>(null) }
    var appliedTopAd by remember(readerRequestId, chapterKey) { mutableStateOf(topAdEnabled) }

    fun seekToPage(
        page: Int,
        force: Boolean = false,
    ) {
        val boundedPage = ReaderLogic.boundedPage(page, pages.size)
        if (!force && sliderValue.toInt() == boundedPage) return
        sliderValue = boundedPage.toFloat()
        viewModel.setReaderPage(boundedPage)
        seekJob?.cancel()
        seekJob = scope.launch { listState.scrollToItem(pageStartIndex + boundedPage) }
    }

    BackHandler(onBack = onBack)
    ReaderSystemBarsEffect(chromeVisible)
    DisposableEffect(viewModel, readerRequestId) {
        onDispose { viewModel.stopReaderPrefetch(readerRequestId) }
    }
    LaunchedEffect(readerRequestId, mangaId, chapterNumber, initialPage) {
        viewModel.loadReader(mangaId, chapterNumber, initialPage, readerRequestId)
    }
    LaunchedEffect(displayedPages, visibleReaderPages) {
        if (!readerReady && displayedPages.any { it in visibleReaderPages }) {
            readerReady = true
            viewModel.ensureAdsLoaded()
        }
    }
    LaunchedEffect(readerRequestId, chapterKey, topAdEnabled) {
        if (content != null && pages.isNotEmpty() && appliedTopAd != topAdEnabled) {
            listState.scrollToItem(pageStartIndex + content.currentPage.coerceIn(pages.indices))
            appliedTopAd = topAdEnabled
        }
    }
    LaunchedEffect(content?.currentPage, sliderDragging) {
        if (!sliderDragging) sliderValue = content?.currentPage?.toFloat() ?: 0f
    }
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress }
            .distinctUntilChanged()
            .collect { scrolling -> if (scrolling) chromeVisible = false }
    }
    LaunchedEffect(listState, pages) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo }
            .map { visible ->
                val visiblePages =
                    visible.mapNotNull { item ->
                        val key = item.key as? String ?: return@mapNotNull null
                        if (!key.startsWith("page-")) return@mapNotNull null
                        val viewportStart = listState.layoutInfo.viewportStartOffset
                        val viewportEnd = listState.layoutInfo.viewportEndOffset
                        val visibleStart = maxOf(item.offset, viewportStart)
                        val visibleEnd = minOf(item.offset + item.size, viewportEnd)
                        key.removePrefix("page-").toIntOrNull()?.let { index ->
                            VisibleReaderPage(index, visibleEnd - visibleStart, item.size)
                        }
                    }
                ReaderLogic.activePage(visiblePages) to visiblePages.filter { it.visiblePixels > 0 }.map { it.index }.toSet()
            }
            .distinctUntilChanged()
            .collect { (page, visiblePages) ->
                visibleReaderPages = visiblePages
                if (page != null) viewModel.setReaderPage(page, visiblePages)
            }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when {
            content == null && state.error == null ->
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null && content == null ->
                ReaderError(
                    message = state.error.orEmpty(),
                    onRetry = { viewModel.loadReader(mangaId, chapterNumber, initialPage, readerRequestId) },
                    modifier = Modifier.align(Alignment.Center),
                )
            pages.isEmpty() ->
                ReaderError(
                    message = "本章节没有可显示的图片",
                    onRetry = { viewModel.loadReader(mangaId, chapterNumber, initialPage, readerRequestId) },
                    modifier = Modifier.align(Alignment.Center),
                )
            else -> {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    if (topAdEnabled) {
                        item(key = "reader-top-ad") {
                            HtmlAd(ads.reader.top.html, modifier = Modifier.padding(vertical = 12.dp))
                        }
                    }
                    itemsIndexed(pages, key = { index, _ -> "page-$index" }) { index, page ->
                        key(page.imageUrl) {
                            val previewMemoryCacheKey =
                                ReaderLogic.previewMemoryCacheKey(mangaId, chapterNumber, page)
                            ZoomableReaderPage(
                                pagePosition = index,
                                page = page,
                                previewMemoryCacheKey = previewMemoryCacheKey,
                                onDisplayed = { displayedPage ->
                                    if (displayedPage !in displayedPages) {
                                        displayedPages = displayedPages + displayedPage
                                    }
                                },
                                onTap = { chromeVisible = !chromeVisible },
                                onZoomChanged = { zoomed -> if (zoomed) chromeVisible = false },
                            )
                        }
                    }
                    item(key = "chapter-end") {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text("本话完", color = Color.White, style = MaterialTheme.typography.titleLarge)
                            Text(
                                if (nextChapter == null) "已经是最后一话" else "继续下一话",
                                color = Color(0xFFAAA69F),
                            )
                            nextChapter?.let { next ->
                                Button(onClick = { onChapter(next.number) }, modifier = Modifier.heightIn(min = 48.dp)) {
                                    Text("第 ${formatChapter(next.number)} 话")
                                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                                }
                            }
                        }
                    }
                    if (readerReady && ads.reader.bottom.enabled && ads.reader.bottom.html.isNotBlank()) {
                        item(key = "reader-bottom-ad") {
                            HtmlAd(ads.reader.bottom.html, modifier = Modifier.padding(vertical = 12.dp))
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = chromeVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter),
        ) {
            Surface(color = Color(0xE6111111)) {
                Row(
                    modifier =
                        Modifier.fillMaxWidth().windowInsetsPadding(
                            WindowInsets.safeDrawing.only(
                                WindowInsetsSides.Top + WindowInsetsSides.Horizontal,
                            ),
                        ).heightIn(min = 64.dp).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回漫画详情", tint = Color.White)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            content?.manga?.title.orEmpty(),
                            color = Color.White,
                            maxLines = 1,
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "第 ${formatChapter(chapterNumber)} 话",
                            color = Color(0xFFAAA69F),
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    IconButton(onClick = { chapterSheetVisible = true }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Default.FormatListNumbered, contentDescription = "章节目录", tint = Color.White)
                    }
                    IconButton(onClick = viewModel::toggleReaderFavorite, modifier = Modifier.size(48.dp)) {
                        Icon(
                            if (content?.favorite == true) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = if (content?.favorite == true) "取消收藏" else "收藏漫画",
                            tint = if (content?.favorite == true) MaterialTheme.colorScheme.primary else Color.White,
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = chromeVisible && pages.isNotEmpty(),
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            Surface(color = Color(0xE6111111)) {
                Column(
                    Modifier.fillMaxWidth().windowInsetsPadding(
                        WindowInsets.safeDrawing.only(
                            WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal,
                        ),
                    ).padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { content?.previousChapter?.let { onChapter(it.number) } },
                            enabled = content?.previousChapter != null,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "上一话")
                        }
                        Slider(
                            value = sliderValue.coerceIn(0f, (pages.size - 1).coerceAtLeast(1).toFloat()),
                            onValueChange = { value ->
                                sliderDragging = true
                                seekToPage(ReaderLogic.pageFromSlider(value, pages.size))
                            },
                            onValueChangeFinished = {
                                sliderDragging = false
                                seekToPage(
                                    ReaderLogic.pageFromSlider(sliderValue, pages.size),
                                    force = true,
                                )
                            },
                            valueRange = 0f..(pages.size - 1).coerceAtLeast(1).toFloat(),
                            steps = (pages.size - 2).coerceAtLeast(0),
                            modifier =
                                Modifier.weight(1f).padding(horizontal = 8.dp)
                                    .systemGestureExclusion(),
                        )
                        IconButton(
                            onClick = { content?.nextChapter?.let { onChapter(it.number) } },
                            enabled = content?.nextChapter != null,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "下一话")
                        }
                    }
                    Text(
                        "第 ${ReaderLogic.pageFromSlider(sliderValue, pages.size) + 1} / ${pages.size} 页",
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
            }
        }
    }

    if (chapterSheetVisible && content != null) {
        ModalBottomSheet(onDismissRequest = { chapterSheetVisible = false }) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("章节目录", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = { chapterSheetVisible = false }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "关闭章节目录")
                }
            }
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
                items(content.manga.chapters, key = MangaChapterSummary::id) { chapter ->
                    Row(
                        modifier =
                            Modifier.fillMaxWidth().background(
                                if (chapter.number == chapterNumber) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    Color.Transparent
                                },
                            ).padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "第 ${formatChapter(chapter.number)} 话",
                            modifier = Modifier.weight(1f),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Button(
                            onClick = {
                                chapterSheetVisible = false
                                onChapter(chapter.number)
                            },
                            enabled = chapter.number != chapterNumber,
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text(if (chapter.number == chapterNumber) "当前" else "阅读") }
                    }
                    HorizontalDivider()
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
internal fun ZoomableReaderPage(
    pagePosition: Int,
    page: MangaPage,
    previewMemoryCacheKey: String,
    onDisplayed: (Int) -> Unit,
    onTap: () -> Unit,
    onZoomChanged: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    var ratio by remember(page.imageUrl) { mutableFloatStateOf(0.72f) }
    var imageSize by remember(page.imageUrl) { mutableStateOf(IntSize.Zero) }
    var retry by remember(page.imageUrl) { mutableIntStateOf(0) }
    var loadState by remember(page.imageUrl) { mutableStateOf(PageLoadState.Loading) }
    val zoomableState = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 4f))
    val imageState = rememberZoomableImageState(zoomableState)
    val request =
        remember(page.imageUrl, previewMemoryCacheKey, retry) {
            val originalMemoryCacheKey = ReaderLogic.originalMemoryCacheKey(page.imageUrl, retry)
            ImageRequest.Builder(context)
                .data(page.imageUrl)
                .memoryCacheKey(originalMemoryCacheKey)
                .placeholderMemoryCacheKey(previewMemoryCacheKey)
                .diskCacheKey(page.imageUrl)
                .readerImageRequest()
                .crossfade(false)
                .listener(
                    onStart = { loadState = PageLoadState.Loading },
                    onSuccess = { _, result ->
                        val width = result.drawable.intrinsicWidth
                        val height = result.drawable.intrinsicHeight
                        imageSize = IntSize(width.coerceAtLeast(0), height.coerceAtLeast(0))
                        ratio = ReaderLogic.pageAspectRatio(width, height)
                    },
                    onError = { _, _ -> loadState = PageLoadState.Error },
                ).build()
        }
    LaunchedEffect(imageState, page.imageUrl, retry) {
        snapshotFlow { imageState.isPlaceholderDisplayed }
            .distinctUntilChanged()
            .first { displayed -> displayed }
        if (loadState == PageLoadState.Loading) loadState = PageLoadState.Preview
    }
    LaunchedEffect(imageState, page.imageUrl, retry) {
        snapshotFlow { imageState.isImageDisplayed }
            .distinctUntilChanged()
            .first { displayed -> displayed }
        loadState = PageLoadState.Ready
        withFrameNanos { }
        withFrameNanos { }
        if (imageState.isImageDisplayed) onDisplayed(pagePosition)
    }
    LaunchedEffect(zoomableState) {
        snapshotFlow { zoomableState.zoomFraction }
            .distinctUntilChanged()
            .collect { fraction -> onZoomChanged((fraction ?: 0f) > 0.01f) }
    }
    val viewportHeight = LocalConfiguration.current.screenHeightDp.coerceAtLeast(1).dp
    val density = LocalDensity.current
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val boundedViewport =
            ReaderLogic.requiresBoundedViewport(
                imageWidth = imageSize.width,
                imageHeight = imageSize.height,
                viewportWidth = with(density) { maxWidth.roundToPx() },
                viewportHeight = with(density) { viewportHeight.roundToPx() },
            )
        val pageModifier =
            if (boundedViewport) {
                Modifier.fillMaxWidth().height(viewportHeight)
            } else {
                Modifier.fillMaxWidth().aspectRatio(ratio)
            }
        Box(
            modifier = pageModifier,
            contentAlignment = Alignment.Center,
        ) {
            ZoomableAsyncImage(
                model = request,
                contentDescription = "漫画第 ${page.index + 1} 页",
                state = imageState,
                imageLoader = context.imageLoader,
                modifier = Modifier.fillMaxSize(),
                alignment = Alignment.TopCenter,
                contentScale = ContentScale.FillWidth,
                onClick = {
                    if ((zoomableState.zoomFraction ?: 0f) <= 0.01f) onTap()
                },
            )
            when (loadState) {
                PageLoadState.Loading -> {
                    Box(Modifier.fillMaxSize().background(Color(0xFF111111)), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                PageLoadState.Error -> {
                    Column(
                        modifier = Modifier.fillMaxSize().background(Color(0xFF111111)),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Default.BrokenImage, contentDescription = null, tint = Color.White)
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { retry++ }) {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                            Text("重试本页")
                        }
                    }
                }
                PageLoadState.Preview,
                PageLoadState.Ready,
                -> Unit
            }
        }
    }
}

private enum class PageLoadState {
    Loading,
    Preview,
    Ready,
    Error,
}

@Composable
private fun ReaderError(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, color = Color.White)
        Button(onClick = onRetry) {
            Icon(Icons.Default.Refresh, contentDescription = null)
            Text("重试")
        }
    }
}

@Composable
private fun ReaderSystemBarsEffect(chromeVisible: Boolean) {
    val context = LocalContext.current
    val activity = context as? Activity ?: return
    DisposableEffect(activity, chromeVisible) {
        val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (chromeVisible) {
            controller.show(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        }
        onDispose { controller.show(WindowInsetsCompat.Type.systemBars()) }
    }
}
