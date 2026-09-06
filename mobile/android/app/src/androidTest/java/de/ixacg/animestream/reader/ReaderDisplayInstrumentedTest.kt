package de.ixacg.animestream.reader

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.Coil
import coil.EventListener
import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.decode.DecodeResult
import coil.decode.Decoder
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.ErrorResult
import coil.request.ImageRequest
import coil.request.Options
import coil.request.SuccessResult
import de.ixacg.animestream.core.model.MangaPage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@OptIn(ExperimentalCoilApi::class)
@RunWith(AndroidJUnit4::class)
class ReaderDisplayInstrumentedTest {
    @get:Rule
    val compose = createComposeRule()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val observations = CopyOnWriteArrayList<Observation>()
    private val heldResponses = ConcurrentHashMap<String, CountDownLatch>()
    private val heldPreviewDecodes = ConcurrentHashMap<String, CountDownLatch>()
    private val heldDisplayDecodes = ConcurrentHashMap<String, CountDownLatch>()
    private val failingResponses = ConcurrentHashMap.newKeySet<String>()
    private val responseBodies = ConcurrentHashMap<String, ByteArray>()
    private lateinit var context: Context
    private lateinit var server: MockWebServer
    private lateinit var client: OkHttpClient
    private lateinit var loader: ImageLoader
    private lateinit var preloader: ReaderPreviewPreloader
    private lateinit var listState: LazyListState
    private lateinit var canvasState: ReaderCanvasState
    private var mounted by mutableStateOf(true)
    private var showTopAd by mutableStateOf(false)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val image = png(900, 1_600)
        server = MockWebServer()
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val path = requireNotNull(request.path)
                    record(path, "network-request")
                    heldResponses[path]?.await(15, TimeUnit.SECONDS)
                    if (failingResponses.remove(path)) return MockResponse().setResponseCode(503)
                    return MockResponse()
                        .setHeader("Content-Type", "image/png")
                        .setHeader("Cache-Control", "public, max-age=3600")
                        .setBody(Buffer().write(responseBodies[path] ?: image))
                }
            }
        server.start()
        client =
            OkHttpClient.Builder()
                .retryOnConnectionFailure(false)
                .eventListenerFactory {
                    object : okhttp3.EventListener() {
                        override fun responseBodyEnd(
                            call: Call,
                            byteCount: Long,
                        ) {
                            record(call.request().url.encodedPath, "network-complete:$byteCount")
                        }
                    }
                }.build()
        loader =
            ImageLoader.Builder(context)
                .okHttpClient(client)
                .diskCache(
                    DiskCache.Builder()
                        .directory(File(context.cacheDir, "reader-device-test-${System.nanoTime()}"))
                        .build(),
                )
                .memoryCache(MemoryCache.Builder(context).maxSizeBytes(24 * 1024 * 1024).build())
                .networkObserverEnabled(false)
                .respectCacheHeaders(false)
                .components { add(ReaderImageSingleFlight.Factory()) }
                .eventListenerFactory {
                    object : EventListener {
                        override fun onStart(request: ImageRequest) {
                            record(path(request), "coil-start")
                        }

                        override fun decodeStart(
                            request: ImageRequest,
                            decoder: Decoder,
                            options: Options,
                        ) {
                            record(path(request), "decode-start:${decoder.javaClass.simpleName}")
                            if (request.memoryCacheKey?.key?.startsWith("reader-preview:") == true) {
                                heldPreviewDecodes[path(request)]?.await(15, TimeUnit.SECONDS)
                            } else {
                                heldDisplayDecodes[path(request)]?.await(15, TimeUnit.SECONDS)
                            }
                        }

                        override fun onSuccess(
                            request: ImageRequest,
                            result: SuccessResult,
                        ) {
                            record(path(request), "coil-success:${result.dataSource}")
                        }

                        override fun decodeEnd(
                            request: ImageRequest,
                            decoder: Decoder,
                            options: Options,
                            result: DecodeResult?,
                        ) {
                            record(path(request), "decode-end:${decoder.javaClass.simpleName}")
                        }

                        override fun onError(
                            request: ImageRequest,
                            result: ErrorResult,
                        ) {
                            record(path(request), "coil-error")
                        }
                    }
                }.build()
        Coil.setImageLoader(loader)
        preloader = ReaderPreviewPreloader(context, loader, scope)
    }

    @After
    fun tearDown() {
        heldResponses.values.forEach(CountDownLatch::countDown)
        heldPreviewDecodes.values.forEach(CountDownLatch::countDown)
        heldDisplayDecodes.values.forEach(CountDownLatch::countDown)
        compose.runOnIdle { mounted = false }
        compose.waitForIdle()
        preloader.cancelAll()
        scope.cancel()
        loader.shutdown()
        client.dispatcher.cancelAll()
        client.connectionPool.evictAll()
        client.dispatcher.executorService.shutdown()
        server.shutdown()
        Coil.reset()
        observations.sortedBy(Observation::atMillis).forEach { Log.i("ReaderPipelineTiming", it.toString()) }
    }

    @Test
    fun delayedFirstPageDoesNotBlockLookaheadAndTheNextPageIsReadyBeforeScrolling() {
        heldResponses["/page-0.png"] = CountDownLatch(1)
        val pages = pages(80)
        mount(pages)
        compose.waitUntil(10_000) { requested(1) && requested(2) }

        assertFalse(displayed(0))
        assertTrue(requestedPages().all { it <= ReaderLogic.FORWARD_PREFETCH_PAGES })
        val releasedAt = SystemClock.elapsedRealtime()
        heldResponses.getValue("/page-0.png").countDown()
        compose.waitUntil(10_000) { displayed(0) }
        val firstDisplayedAt = observations.first { it.path == "/page-0.png" && it.event == "displayed" }.atMillis
        assertTrue("First-page display must not wait for the rest of the window", firstDisplayedAt - releasedAt < 5_000)
        assertImagePixels()

        compose.onNodeWithTag(LIST_TAG).performScrollToIndex(2)
        compose.waitUntil(10_000) { displayed(2) && visible(2) }
        val requestAt = observations.first { it.path == "/page-2.png" && it.event == "network-request" }.atMillis
        val visibleAt = observations.first { it.path == "/page-2.png" && it.event == "visible" }.atMillis
        assertTrue(requestAt < visibleAt)
        assertEquals(1, networkRequests(2))
        assertImagePixels()
    }

    @Test
    fun visibleOriginalPaintsWhilePreparedPreviewDecoderIsStillWaiting() {
        val pages = pages(1)
        val gate = CountDownLatch(1)
        heldPreviewDecodes["/page-0.png"] = gate
        preloader.warm(pages[0].imageUrl, ReaderLogic.previewMemoryCacheKey(8, 1.0, pages[0]))
        compose.waitUntil(10_000) {
            observations.any { it.path == "/page-0.png" && it.event.startsWith("decode-start:") }
        }

        mount(pages)
        compose.waitUntil(10_000) { displayed(0) }

        assertEquals("Actual display must not wait for the prepared preview decoder", 1L, gate.count)
        assertEquals(1, networkRequests(0))
        assertImagePixels()
        gate.countDown()
    }

    @Test
    fun restoredPositionReverseScrollingAndFastJumpKeepTheCanvasReachable() {
        val pages = pages(140)
        mount(pages, initialPage = 70)
        compose.waitUntil(10_000) { displayed(70) && requested(71) }
        assertFalse(requested(0))
        compose.onNodeWithTag(LIST_TAG).performScrollToIndex(69)
        compose.waitUntil(10_000) { displayed(69) && requested(68) }

        heldResponses["/page-120.png"] = CountDownLatch(1)
        compose.onNodeWithTag(LIST_TAG).performScrollToIndex(120)
        compose.waitUntil(10_000) { requested(120) && requested(121) }
        assertFalse(displayed(120))
        heldResponses.getValue("/page-120.png").countDown()
        compose.waitUntil(10_000) { displayed(120) }
        assertImagePixels()
        assertTrue(requestedPages().size < 40)
    }

    @Test
    fun longPageIsDisplayedInsideAFiniteViewportAndCanScrollToTheNextPage() {
        responseBodies["/page-0.png"] = png(256, 32_768)
        val pages = pages(12)
        mount(pages)
        compose.waitUntil(15_000) { displayed(0) }
        assertImagePixels()
        compose.runOnIdle {
            val item = listState.layoutInfo.visibleItemsInfo.first { it.index == 0 }
            val viewportHeight = listState.layoutInfo.viewportEndOffset - listState.layoutInfo.viewportStartOffset
            assertTrue(item.size <= viewportHeight * 2)
        }
        compose.onNodeWithTag(LIST_TAG).performScrollToIndex(1)
        compose.waitUntil(10_000) { displayed(1) }
        assertEquals(1, networkRequests(0))
        assertImagePixels()
    }

    @Test
    fun failedVisiblePageCanRetryAndPaintWithoutReloadingTheChapter() {
        failingResponses += "/page-0.png"
        mount(pages(12))
        compose.waitUntil(10_000) { observations.any { it.path == "/page-0.png" && it.event == "coil-error" } }
        assertFalse(displayed(0))

        compose.onNodeWithText("\u91cd\u8bd5\u672c\u9875").performClick()
        compose.waitUntil(10_000) { displayed(0) }

        assertEquals(2, networkRequests(0))
        assertImagePixels()
    }

    @Test
    fun pinchOnPreparedPreviewChangesChapterScaleAndKeepsLaterPagesAtThatScale() {
        val pages = pages(80)
        val previewKey = ReaderLogic.previewMemoryCacheKey(8, 1.0, pages[0])
        preloader.warm(pages[0].imageUrl, previewKey)
        compose.waitUntil(10_000) { preloader.currentState(previewKey) == ReaderPreviewState.Ready }
        val displayGate = CountDownLatch(1)
        heldDisplayDecodes["/page-0.png"] = displayGate
        mount(pages)
        compose.waitUntil(10_000) {
            observations.count { it.path == "/page-0.png" && it.event.startsWith("decode-start:") } >= 2
        }
        val originalHeight = compose.runOnIdle { listState.layoutInfo.visibleItemsInfo.first { it.index == 0 }.size }
        assertFalse(displayed(0))
        assertImagePixels()

        compose.onNodeWithTag(CANVAS_TAG).performTouchInput {
            pinch(
                start0 = Offset(width * 0.4f, height * 0.5f),
                start1 = Offset(width * 0.6f, height * 0.5f),
                end0 = Offset(width * 0.2f, height * 0.5f),
                end1 = Offset(width * 0.8f, height * 0.5f),
                durationMillis = 600,
            )
        }
        compose.waitUntil(10_000) { canvasState.scale > 1.5f }
        assertFalse(displayed(0))
        displayGate.countDown()
        compose.waitUntil(10_000) { displayed(0) }
        assertEquals(1, networkRequests(0))

        compose.onNodeWithTag(LIST_TAG).performScrollToIndex(2)
        compose.waitUntil(10_000) { displayed(2) && visible(2) }
        compose.runOnIdle {
            val item = listState.layoutInfo.visibleItemsInfo.first { it.index == 2 }
            assertTrue(item.size > originalHeight * 1.5f)
            assertFalse(canvasState.hasMultiplePointers)
        }
        val oldOffset = compose.runOnIdle { listState.firstVisibleItemScrollOffset }
        compose.onNodeWithTag(CANVAS_TAG).performTouchInput { swipeUp() }
        compose.runOnIdle {
            assertTrue(listState.firstVisibleItemIndex > 2 || listState.firstVisibleItemScrollOffset > oldOffset)
        }
        assertTrue(requestedPages().size < 20)
        assertImagePixels()
    }

    @Test
    fun insertingReadyTopAdPreservesVisiblePageAndItsScrollOffset() {
        mount(pages(80))
        compose.waitUntil(10_000) { displayed(0) }
        compose.runOnIdle { scope.launch { listState.scrollToItem(0, 180) } }
        compose.waitUntil(10_000) { listState.firstVisibleItemScrollOffset == 180 }

        compose.runOnIdle { showTopAd = true }
        compose.waitUntil(10_000) { listState.firstVisibleItemIndex == 1 }

        compose.runOnIdle {
            assertEquals(180, listState.firstVisibleItemScrollOffset)
            assertEquals("page-0", listState.layoutInfo.visibleItemsInfo.first { it.index == 1 }.key)
        }
        assertImagePixels()
    }

    @Test
    fun topAdInsertedDuringPinchKeepsTheSamePageUnderTheGestureCenter() {
        mount(pages(80))
        compose.waitUntil(10_000) { displayed(0) }
        compose.runOnIdle { scope.launch { listState.scrollToItem(0, 180) } }
        compose.waitUntil(10_000) { listState.firstVisibleItemScrollOffset == 180 }
        val focalY = 220f
        val pageFraction =
            compose.runOnIdle {
                val item = listState.layoutInfo.visibleItemsInfo.first { it.key == "page-0" }
                (focalY - item.offset) / item.size
            }
        compose.onNodeWithTag(CANVAS_TAG).performTouchInput {
            down(0, Offset(width * 0.4f, focalY))
            down(1, Offset(width * 0.6f, focalY))
            updatePointerTo(0, Offset(width * 0.3f, focalY))
            updatePointerTo(1, Offset(width * 0.7f, focalY))
            move()
        }
        compose.waitUntil(10_000) { canvasState.scale > 1.5f }

        compose.runOnIdle { showTopAd = true }
        compose.waitUntil(10_000) { listState.firstVisibleItemIndex == 1 }
        compose.onNodeWithTag(CANVAS_TAG).performTouchInput {
            updatePointerTo(0, Offset(width * 0.15f, focalY))
            updatePointerTo(1, Offset(width * 0.85f, focalY))
            move()
            up(0)
            up(1)
        }

        compose.runOnIdle {
            val item = listState.layoutInfo.visibleItemsInfo.first { it.key == "page-0" }
            assertEquals(focalY, item.offset + item.size * pageFraction, 12f)
            assertTrue(canvasState.scale > 2.5f)
            assertFalse(canvasState.hasMultiplePointers)
        }
        assertImagePixels()
    }

    @Test
    fun fingersOnAdjacentPagesZoomTheChapterAndKeepTheBoundaryUnderTheirCenter() {
        responseBodies["/page-0.png"] = png(900, 500)
        responseBodies["/page-1.png"] = png(900, 500)
        mount(pages(80))
        compose.waitUntil(10_000) { displayed(0) && displayed(1) }
        val boundary = compose.runOnIdle { listState.layoutInfo.visibleItemsInfo.first { it.index == 1 }.offset.toFloat() }

        compose.onNodeWithTag(CANVAS_TAG).performTouchInput {
            pinch(
                start0 = Offset(width * 0.4f, boundary - 35f),
                start1 = Offset(width * 0.6f, boundary + 35f),
                end0 = Offset(width * 0.15f, boundary - 35f),
                end1 = Offset(width * 0.85f, boundary + 35f),
                durationMillis = 600,
            )
        }
        compose.waitUntil(10_000) { canvasState.scale > 1.5f }

        compose.runOnIdle {
            val second = listState.layoutInfo.visibleItemsInfo.first { it.index == 1 }
            assertEquals(boundary, second.offset.toFloat(), 12f)
            assertFalse(canvasState.hasMultiplePointers)
        }
        assertTrue(requestedPages().size < 20)
        assertImagePixels()
    }

    private fun mount(
        pages: List<MangaPage>,
        initialPage: Int = 0,
    ) {
        compose.setContent {
            MaterialTheme {
                if (mounted) {
                    listState = rememberLazyListState(initialFirstVisibleItemIndex = initialPage)
                    canvasState = rememberReaderCanvasState()
                    LaunchedEffect(pages, listState) {
                        snapshotFlow { listState.layoutInfo.visibleItemsInfo }
                            .map { items ->
                                items.filter { item ->
                                    item.offset < listState.layoutInfo.viewportEndOffset && item.offset + item.size > 0
                                }.mapNotNull { item ->
                                    (item.key as? String)?.removePrefix("page-")?.toIntOrNull()
                                }.toSet()
                            }
                            .distinctUntilChanged()
                            .collect { visible ->
                                visible.forEach { record("/page-$it.png", "visible") }
                                visible.minOrNull()?.let { current ->
                                    preloader.updateWindow(8, 1.0, pages, current, visible)
                                }
                            }
                    }
                    ReaderCanvas(
                        state = canvasState,
                        listState = listState,
                        onTransform = {},
                        modifier = Modifier.fillMaxSize().background(Color.Black).testTag(CANVAS_TAG),
                    ) {
                        LazyColumn(
                            state = listState,
                            userScrollEnabled = !canvasState.hasMultiplePointers,
                            modifier = Modifier.fillMaxSize().background(Color.Black).testTag(LIST_TAG),
                        ) {
                            if (showTopAd) {
                                item(key = "reader-top-ad") { Box(Modifier.fillMaxWidth().height(90.dp)) }
                            }
                            itemsIndexed(pages, key = { index, _ -> "page-$index" }) { index, page ->
                                ZoomableReaderPage(
                                    pagePosition = index,
                                    page = page,
                                    previewMemoryCacheKey = ReaderLogic.previewMemoryCacheKey(8, 1.0, page),
                                    onDisplayed = { record("/page-$it.png", "displayed") },
                                    onTap = {},
                                    readingScale = canvasState.scale,
                                    pagePanEnabled = !canvasState.hasMultiplePointers,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private fun assertImagePixels() {
        val pixels = compose.onNodeWithTag(CANVAS_TAG).captureToImage().toPixelMap()
        val center = pixels[pixels.width / 2, pixels.height / 2]
        assertTrue("The canvas must contain the controlled green image, not an empty surface", center.green > center.red + 0.1f)
    }

    private fun pages(count: Int): List<MangaPage> = (0 until count).map { index -> MangaPage(index, server.url("/page-$index.png").toString()) }

    private fun requested(index: Int): Boolean = networkRequests(index) > 0

    private fun networkRequests(index: Int): Int = observations.count { it.path == "/page-$index.png" && it.event == "network-request" }

    private fun displayed(index: Int): Boolean = observations.any { it.path == "/page-$index.png" && it.event == "displayed" }

    private fun visible(index: Int): Boolean = observations.any { it.path == "/page-$index.png" && it.event == "visible" }

    private fun requestedPages(): Set<Int> =
        observations.filter { it.event == "network-request" }
            .mapNotNull { it.path.removePrefix("/page-").removeSuffix(".png").toIntOrNull() }.toSet()

    private fun path(request: ImageRequest): String = "/${request.data.toString().removePrefix(server.url("/").toString())}"

    private fun record(
        path: String,
        event: String,
    ) {
        observations += Observation(path, event)
    }

    private fun png(
        width: Int,
        height: Int,
    ): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.rgb(20, 120, 80))
        return ByteArrayOutputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            bitmap.recycle()
            output.toByteArray()
        }
    }

    private data class Observation(
        val path: String,
        val event: String,
        val atMillis: Long = SystemClock.elapsedRealtime(),
    )

    private companion object {
        const val LIST_TAG = "reader-test-list"
        const val CANVAS_TAG = "reader-test-canvas"
    }
}
