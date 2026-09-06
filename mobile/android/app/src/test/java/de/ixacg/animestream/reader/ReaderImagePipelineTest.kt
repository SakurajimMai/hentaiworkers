package de.ixacg.animestream.reader

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import androidx.test.core.app.ApplicationProvider
import coil.EventListener
import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.decode.BitmapFactoryDecoder
import coil.decode.DataSource
import coil.decode.DecodeResult
import coil.decode.Decoder
import coil.disk.DiskCache
import coil.fetch.SourceResult
import coil.memory.MemoryCache
import coil.request.ErrorResult
import coil.request.ImageRequest
import coil.request.Options
import coil.request.SuccessResult
import de.ixacg.animestream.core.model.MangaPage
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@OptIn(ExperimentalCoroutinesApi::class, ExperimentalCoilApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReaderImagePipelineTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private val dispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val heldResponses = ConcurrentHashMap<String, CountDownLatch>()
    private val heldPreviewDecodes = ConcurrentHashMap<String, CountDownLatch>()
    private val failingResponses = ConcurrentHashMap.newKeySet<String>()
    private val bodies = ConcurrentHashMap<String, ByteArray>()
    private val requests = CopyOnWriteArrayList<Observation>()
    private val events = CopyOnWriteArrayList<Observation>()
    private val imageFailures = ConcurrentHashMap<String, Throwable>()
    private val activeCalls = ConcurrentHashMap.newKeySet<Call>()
    private val maximumCalls = AtomicInteger()
    private lateinit var context: Context
    private lateinit var server: MockWebServer
    private lateinit var client: OkHttpClient
    private lateinit var imageLoader: ImageLoader
    private lateinit var preloader: ReaderPreviewPreloader
    private var prefetchClock: TestCoroutineScheduler? = null
    private lateinit var ordinaryImage: ByteArray

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        context = ApplicationProvider.getApplicationContext()
        ordinaryImage = png(width = 900, height = 1_600)
        server = MockWebServer()
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val path = requireNotNull(request.path)
                    requests += Observation(path, "network-request")
                    heldResponses[path]?.await(10, TimeUnit.SECONDS)
                    if (failingResponses.remove(path)) return MockResponse().setResponseCode(503)
                    return MockResponse()
                        .setHeader("Content-Type", "image/png")
                        .setHeader("Cache-Control", "public, max-age=3600")
                        .setBody(Buffer().write(bodies[path] ?: ordinaryImage))
                }
            }
        server.start()
        client =
            OkHttpClient.Builder()
                .eventListenerFactory {
                    object : okhttp3.EventListener() {
                        override fun callStart(call: Call) {
                            activeCalls += call
                            val active = activeCalls.count { !it.isCanceled() }
                            maximumCalls.updateAndGet { previous -> maxOf(previous, active) }
                            events += Observation(call.request().url.encodedPath, "active-uncancelled:$active")
                        }

                        override fun callEnd(call: Call) {
                            activeCalls -= call
                            events += Observation(call.request().url.encodedPath, "network-complete")
                        }

                        override fun callFailed(
                            call: Call,
                            ioe: java.io.IOException,
                        ) {
                            activeCalls -= call
                            events += Observation(call.request().url.encodedPath, "network-failed")
                            events +=
                                Observation(
                                    call.request().url.encodedPath,
                                    "network-failure:${ioe.javaClass.name}:${ioe.message}:canceled=${call.isCanceled()}",
                                )
                        }
                    }
                }.build()
        imageLoader =
            ImageLoader.Builder(context)
                .okHttpClient(client)
                .diskCache(DiskCache.Builder().directory(temporaryFolder.newFolder("images")).build())
                .memoryCache(MemoryCache.Builder(context).maxSizeBytes(24 * 1024 * 1024).build())
                .allowHardware(false)
                .networkObserverEnabled(false)
                .respectCacheHeaders(false)
                .components {
                    add(ReaderImageSingleFlight.Factory())
                    add(
                        object : Decoder.Factory {
                            override fun create(
                                result: SourceResult,
                                options: Options,
                                imageLoader: ImageLoader,
                            ): Decoder {
                                val delegate = BitmapFactoryDecoder.Factory().create(result, options, imageLoader)
                                return Decoder {
                                    val imagePath = "/${options.diskCacheKey.orEmpty().removePrefix(server.url("/").toString())}"
                                    events += Observation(imagePath, "bitmap-decode")
                                    delegate.decode()
                                }
                            }
                        },
                    )
                }
                .eventListenerFactory {
                    object : EventListener {
                        override fun decodeStart(
                            request: ImageRequest,
                            decoder: Decoder,
                            options: Options,
                        ) {
                            events += Observation(path(request), "decode:${decoder.javaClass.simpleName}")
                            if (request.memoryCacheKey?.key?.startsWith("reader-preview:") == true) {
                                heldPreviewDecodes[path(request)]?.await(10, TimeUnit.SECONDS)
                            }
                        }

                        override fun onSuccess(
                            request: ImageRequest,
                            result: SuccessResult,
                        ) {
                            imageFailures.remove(path(request))
                            events += Observation(path(request), "success:${result.dataSource}")
                        }

                        override fun onError(
                            request: ImageRequest,
                            result: ErrorResult,
                        ) {
                            imageFailures[path(request)] = result.throwable
                            events += Observation(path(request), "error:${result.throwable.javaClass.name}:${result.throwable.message}")
                        }

                        override fun onCancel(request: ImageRequest) {
                            events += Observation(path(request), "request-cancelled")
                        }

                        override fun decodeEnd(
                            request: ImageRequest,
                            decoder: Decoder,
                            options: Options,
                            result: DecodeResult?,
                        ) {
                            events += Observation(path(request), "decode-end:${decoder.javaClass.simpleName}")
                        }
                    }
                }.build()
        preloader = ReaderPreviewPreloader(context, imageLoader, scope)
    }

    @After
    fun tearDown() {
        heldResponses.values.forEach(CountDownLatch::countDown)
        heldPreviewDecodes.values.forEach(CountDownLatch::countDown)
        preloader.cancelAll()
        scope.cancel()
        runBlocking {
            withTimeout(5_000) {
                while (scope.coroutineContext[Job]?.isCompleted == false) {
                    prefetchClock?.runCurrent()
                    delay(10)
                }
            }
        }
        imageLoader.shutdown()
        client.dispatcher.cancelAll()
        client.connectionPool.evictAll()
        client.dispatcher.executorService.shutdown()
        server.shutdown()
        Dispatchers.resetMain()
        dispatcher.close()
        println("reader-pipeline-observations: ${(requests + events).sortedBy(Observation::atNanos)}")
        println("reader-pipeline-display-time: not measured by transport tests; see ReaderDisplayInstrumentedTest")
    }

    @Test
    fun `pending initial original leaves bounded capacity for pages ahead`() =
        runBlocking {
            val pages = pages(80)
            hold("/page-0.png")
            hold("/page-1.png")
            hold("/page-2.png")
            val first = async { imageLoader.execute(displayRequest(pages[0])) }
            await { requested(0) }
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)

            await { requested(1) && requested(2) }
            assertFalse(first.isCompleted)
            assertEquals(setOf(0, 1, 2), requestedPages())
            assertTrue("Only two speculative requests accompany the visible request", maximumCalls.get() <= 3)

            release("/page-0.png")
            assertTrue(first.await() is SuccessResult)
        }

    @Test
    fun `startup grace expires while the target is held and repeated positions do not reset it`() =
        runBlocking {
            val clock = controlledPrefetchClock()
            val pages = pages(80)
            hold("/page-0.png")
            hold("/page-1.png")
            hold("/page-2.png")
            preloader.warm(pages[0].imageUrl, previewKey(pages[0]))
            await(clock) { requested(0) }
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            clock.runCurrent()

            clock.advanceTimeBy(ReaderPreviewPreloader.STARTUP_PREFETCH_GRACE_MS - 1)
            clock.runCurrent()
            assertEquals(setOf(0), requestedPages())
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            clock.advanceTimeBy(1)
            await(clock) { requested(1) && requested(2) }

            assertEquals(ReaderPreviewPreloader.STARTUP_PREFETCH_GRACE_MS, clock.currentTime)
            assertEquals(ReaderPreviewState.Loading, preloader.currentState(previewKey(pages[0])))
            assertEquals(setOf(0, 1, 2), requestedPages())
            assertTrue(maximumCalls.get() <= ReaderPreviewPreloader.MAX_CONCURRENT_PREFETCH + 1)
        }

    @Test
    fun `cached target bypasses startup grace without advancing its timer`() =
        runBlocking {
            val pages = pages(80)
            assertTrue(imageLoader.execute(displayRequest(pages[0])) is SuccessResult)
            val clock = controlledPrefetchClock()
            hold("/page-1.png")
            hold("/page-2.png")
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)

            await(clock) { requested(1) && requested(2) }

            assertEquals(0L, clock.currentTime)
            assertEquals(1, requestCount(0))
            assertTrue(maximumCalls.get() <= ReaderPreviewPreloader.MAX_CONCURRENT_PREFETCH)
        }

    @Test
    fun `moving the visible page releases startup grace immediately`() =
        runBlocking {
            val clock = controlledPrefetchClock()
            val pages = pages(80)
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            clock.runCurrent()
            assertTrue(requests.isEmpty())
            hold("/page-60.png")
            hold("/page-61.png")
            hold("/page-62.png")
            val visible = async { imageLoader.execute(displayRequest(pages[60])) }
            await { requested(60) }
            preloader.updateWindow(8, 1.0, pages, currentPage = 60)

            await(clock) { requested(61) && requested(62) }

            assertEquals(0L, clock.currentTime)
            assertFalse(requested(1))
            assertFalse(visible.isCompleted)
            assertTrue(maximumCalls.get() <= ReaderPreviewPreloader.MAX_CONCURRENT_PREFETCH + 1)
            release("/page-60.png")
            assertTrue(visible.await() is SuccessResult)
        }

    @Test
    fun `prepared target completion releases lookahead before the grace timer`() =
        runBlocking {
            assertTargetSettlesBeforeGrace(failTarget = false)
        }

    @Test
    fun `prepared target failure releases lookahead before the grace timer`() =
        runBlocking {
            assertTargetSettlesBeforeGrace(failTarget = true)
        }

    @Test
    fun `normal forward reading starts next request before it becomes visible`() =
        runBlocking {
            val pages = pages(40)
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            await { hasPreview(pages[1]) }
            val becameVisibleAt = System.nanoTime()
            val result = imageLoader.execute(displayRequest(pages[1])) as SuccessResult

            assertTrue(requests.single { it.path == "/page-1.png" }.atNanos < becameVisibleAt)
            assertEquals(DataSource.DISK, result.dataSource)
            assertEquals(1, requestCount(1))
            assertTrue("Opening a chapter must not fetch its tail", requestedPages().none { it > 6 })
        }

    @Test
    fun `visible promotion joins a pending preview download exactly once`() =
        runBlocking {
            val page = pages(1).single()
            hold("/page-0.png")
            preloader.warm(page.imageUrl, previewKey(page))
            await { requested(0) }
            val visible = async { imageLoader.execute(displayRequest(page)) }
            delay(100)
            assertFalse(visible.isCompleted)
            assertEquals(1, requestCount(0))

            release("/page-0.png")
            assertTrue(visible.await() is SuccessResult)
            await { preloader.currentState(previewKey(page)) != ReaderPreviewState.Loading }
            assertEquals(1, requestCount(0))
        }

    @Test
    fun `visible original does not wait for preview decoding after the file is ready`() =
        runBlocking {
            val page = pages(1).single()
            val previewDecode = CountDownLatch(1)
            heldPreviewDecodes["/page-0.png"] = previewDecode
            preloader.warm(page.imageUrl, previewKey(page))
            await { events.any { it.path == "/page-0.png" && it.event.startsWith("decode:") } }
            assertEquals(ReaderPreviewState.Loading, preloader.currentState(previewKey(page)))

            val result = withTimeout(3_000) { imageLoader.execute(displayRequest(page)) }

            assertTrue(result is SuccessResult)
            assertEquals("Preview is still deliberately waiting in its decoder", 1L, previewDecode.count)
            assertEquals(1, requestCount(0))
            previewDecode.countDown()
        }

    @Test
    fun `cached original avoids unnecessary preview download and decode`() =
        runBlocking {
            val page = pages(1).single()
            imageLoader.execute(displayRequest(page))
            val decodesBefore = events.count { it.event.startsWith("decode:") }

            preloader.warm(page.imageUrl, previewKey(page))
            delay(100)

            assertEquals(ReaderPreviewState.Idle, preloader.currentState(previewKey(page)))
            assertEquals(decodesBefore, events.count { it.event.startsWith("decode:") })
            assertEquals(1, requestCount(0))
        }

    @Test
    fun `entering the reader preserves a completed prepared target preview`() =
        runBlocking {
            val page = pages(1).single()
            preloader.warm(page.imageUrl, previewKey(page))
            await { preloader.currentState(previewKey(page)) == ReaderPreviewState.Ready }
            val preparedBitmap = requireNotNull(imageLoader.memoryCache?.get(MemoryCache.Key(previewKey(page)))).bitmap
            val decodesBefore = events.count { it.event == "bitmap-decode" }

            preloader.warm(page.imageUrl, previewKey(page))
            preloader.updateWindow(8, 1.0, listOf(page), currentPage = 0)
            delay(100)

            assertSame(preparedBitmap, imageLoader.memoryCache?.get(MemoryCache.Key(previewKey(page)))?.bitmap)
            assertEquals(decodesBefore, events.count { it.event == "bitmap-decode" })
            assertEquals(1, requestCount(0))
        }

    @Test
    fun `far disk window skips bitmap decode and promotes through disk then memory`() =
        runBlocking {
            val pages = pages(30)
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            await { cachedOnDisk(pages[5]) }
            assertFalse(hasPreview(pages[5]))
            assertTrue(events.none { it.path == "/page-5.png" && it.event == "bitmap-decode" })

            val first = imageLoader.execute(displayRequest(pages[5])) as SuccessResult
            val second = imageLoader.execute(displayRequest(pages[5])) as SuccessResult

            assertEquals(DataSource.DISK, first.dataSource)
            assertEquals(DataSource.MEMORY_CACHE, second.dataSource)
            assertEquals(1, requestCount(5))
            assertTrue(events.any { it.path == "/page-5.png" && it.event == "bitmap-decode" })
            assertTrue(events.any { it.path == "/page-5.png" && it.event == "success:MEMORY_CACHE" })
        }

    @Test
    fun `long adjacent pages keep bounded preview bitmaps and original disk bytes`() =
        runBlocking {
            val pages = pages(12)
            bodies["/page-1.png"] = png(width = 256, height = 32_768)
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            await { hasPreview(pages[1]) }

            val bitmap = requireNotNull(imageLoader.memoryCache?.get(MemoryCache.Key(previewKey(pages[1])))).bitmap
            assertTrue(bitmap.width <= ReaderPreviewPreloader.PREVIEW_WIDTH)
            assertTrue(bitmap.height <= ReaderPreviewPreloader.PREVIEW_HEIGHT)
            assertTrue(cachedOnDisk(pages[1]))
            assertEquals(1, requestCount(1))
        }

    @Test
    fun `display handoff bounds long bitmap decode while retaining full resolution for subsampling`() =
        runBlocking {
            val page = pages(1).single()
            bodies["/page-0.png"] = png(width = 768, height = 8_192)

            val result = imageLoader.execute(displayRequest(page)) as SuccessResult
            val bitmap = (result.drawable as BitmapDrawable).bitmap

            assertTrue(bitmap.width <= READER_DISPLAY_WIDTH)
            assertTrue(bitmap.height <= READER_DISPLAY_HEIGHT)
            assertTrue(bitmap.allocationByteCount <= READER_DISPLAY_WIDTH * READER_DISPLAY_HEIGHT * 4)
            imageLoader.diskCache?.openSnapshot(page.imageUrl).use { snapshot ->
                assertNotNull(snapshot)
                val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(requireNotNull(snapshot).data.toString(), dimensions)
                assertEquals(768, dimensions.outWidth)
                assertEquals(8_192, dimensions.outHeight)
            }
            assertEquals(1, requestCount(0))
        }

    @Test
    fun `restoration reverse movement and quick distant jump replace the window`() =
        runBlocking {
            val pages = pages(160)
            // Hold the old windows in HTTP fetch, so both replacements exercise cancellation
            // without racing a response that has already moved into bitmap decoding.
            hold("/page-71.png")
            hold("/page-72.png")
            hold("/page-68.png")
            hold("/page-67.png")
            preloader.updateWindow(8, 1.0, pages, currentPage = 70)
            await { requested(71) && requested(72) }
            assertFalse(requested(0))
            preloader.updateWindow(8, 1.0, pages, currentPage = 69)
            await { requested(68) && requested(67) }

            hold("/page-120.png")
            val jumpedPage = async { imageLoader.execute(displayRequest(pages[120])) }
            preloader.updateWindow(8, 1.0, pages, currentPage = 120)
            await {
                for (path in listOf("/page-120.png", "/page-121.png")) {
                    imageFailures[path]?.let { cause ->
                        throw AssertionError("Jump-window image failed while waiting for requests: $path", cause)
                    }
                }
                requested(120) && requested(121)
            }
            assertFalse(jumpedPage.isCompleted)
            assertFalse(requested(99))
            assertTrue("Two speculative requests plus the visible original stay bounded after replacement", maximumCalls.get() <= 3)
            release("/page-120.png")
            assertTrue(jumpedPage.await() is SuccessResult)
        }

    @Test
    fun `failure cancellation and chapter change do not retain blocked queue slots`() =
        runBlocking {
            val pages = pages(30)
            failingResponses += "/page-1.png"
            hold("/page-2.png")
            preloader.updateWindow(8, 1.0, pages, currentPage = 0)
            await { requested(3) }
            assertTrue(imageLoader.execute(displayRequest(pages[1])) is SuccessResult)
            assertEquals(2, requestCount(1))

            preloader.cancelAll()
            assertEquals(ReaderPreviewState.Idle, preloader.currentState(previewKey(pages[2])))
            val nextChapter = pages.map { it.copy(imageUrl = it.imageUrl.replace("page-", "chapter-two-")) }
            preloader.updateWindow(8, 2.0, nextChapter, currentPage = 10)
            await { requests.any { it.path == "/chapter-two-11.png" } }
            release("/page-2.png")
            assertTrue(imageLoader.execute(displayRequest(nextChapter[10])) is SuccessResult)
            await { events.any { it.path == "/page-2.png" && it.event == "network-failed" } }
        }

    private fun pages(count: Int): List<MangaPage> =
        (0 until count).map { index ->
            MangaPage(index = index, imageUrl = server.url("/page-$index.png").toString())
        }

    private fun controlledPrefetchClock(): TestCoroutineScheduler {
        val clock = TestCoroutineScheduler()
        prefetchClock = clock
        preloader.cancelAll()
        preloader =
            ReaderPreviewPreloader(
                context,
                imageLoader,
                CoroutineScope(scope.coroutineContext + StandardTestDispatcher(clock)),
            )
        return clock
    }

    private suspend fun assertTargetSettlesBeforeGrace(failTarget: Boolean) {
        val clock = controlledPrefetchClock()
        val pages = pages(80)
        hold("/page-0.png")
        hold("/page-1.png")
        hold("/page-2.png")
        if (failTarget) failingResponses += "/page-0.png"
        preloader.warm(pages[0].imageUrl, previewKey(pages[0]))
        await(clock) { requested(0) }
        preloader.updateWindow(8, 1.0, pages, currentPage = 0)
        clock.runCurrent()
        assertFalse(requested(1))
        release("/page-0.png")

        await(clock) { requested(1) && requested(2) }

        assertEquals(0L, clock.currentTime)
        assertEquals(
            if (failTarget) ReaderPreviewState.Idle else ReaderPreviewState.Ready,
            preloader.currentState(previewKey(pages[0])),
        )
        assertEquals(1, requestCount(0))
    }

    private fun previewKey(page: MangaPage): String = ReaderLogic.previewMemoryCacheKey(8, 1.0, page)

    private fun hasPreview(page: MangaPage): Boolean = imageLoader.memoryCache?.get(MemoryCache.Key(previewKey(page))) != null

    private fun displayRequest(page: MangaPage): ImageRequest =
        ImageRequest.Builder(context)
            .data(page.imageUrl)
            .readerDisplayRequest()
            .diskCacheKey(page.imageUrl)
            .memoryCacheKey(ReaderLogic.originalMemoryCacheKey(page.imageUrl, retry = 0))
            .placeholderMemoryCacheKey(previewKey(page))
            .crossfade(false)
            .build()

    private fun cachedOnDisk(page: MangaPage): Boolean =
        imageLoader.diskCache?.openSnapshot(page.imageUrl)?.use { snapshot ->
            assertNotNull(snapshot.data)
            true
        } ?: false

    private fun hold(path: String) {
        heldResponses[path] = CountDownLatch(1)
    }

    private fun release(path: String) {
        heldResponses[path]?.countDown()
    }

    private fun requested(index: Int): Boolean = requestCount(index) > 0

    private fun requestCount(index: Int): Int = requests.count { it.path == "/page-$index.png" }

    private fun requestedPages(): Set<Int> =
        requests.mapNotNull { observation ->
            observation.path.removePrefix("/page-").removeSuffix(".png").toIntOrNull()
        }.toSet()

    private suspend fun await(condition: () -> Boolean) {
        withTimeout(8_000) {
            while (!condition()) delay(10)
        }
    }

    private suspend fun await(
        clock: TestCoroutineScheduler,
        condition: () -> Boolean,
    ) {
        withTimeout(8_000) {
            while (!condition()) {
                clock.runCurrent()
                delay(10)
            }
        }
    }

    private fun path(request: ImageRequest): String = request.data.toString().removePrefix(server.url("/").toString()).let { "/$it" }

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
        val atNanos: Long = System.nanoTime(),
    )
}
