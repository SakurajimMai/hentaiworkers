package de.ixacg.animestream.reader

import android.content.Context
import coil.ImageLoader
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.request.SuccessResult
import coil.size.Precision
import coil.size.Scale
import de.ixacg.animestream.core.model.MangaPage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal enum class ReaderPreviewState {
    Idle,
    Loading,
    Ready,
}

internal class ReaderPreviewPreloader(
    context: Context,
    private val imageLoader: ImageLoader,
    private val scope: CoroutineScope,
) {
    private data class Work(
        val imageUrl: String,
        val memoryCacheKey: String,
        val kind: ReaderPrefetchKind,
    )

    private data class Active(val work: Work, val job: Job)

    private val applicationContext = context.applicationContext
    private val states = MutableStateFlow<Map<String, ReaderPreviewState>>(emptyMap())
    private val active = linkedMapOf<String, Active>()
    private val cancellingJobs = mutableSetOf<Job>()
    private val completed = mutableSetOf<Work>()
    private val failed = mutableSetOf<Work>()
    private var pending = emptyList<Work>()
    private var visibleUrls = emptySet<String>()
    private var chapterKey: ReaderPreparationKey? = null
    private var currentPage: Int? = null
    private var direction = 1
    private var startupTargetUrl: String? = null
    private var startupDelayJob: Job? = null

    fun state(memoryCacheKey: String): Flow<ReaderPreviewState> =
        states.map { values -> values[memoryCacheKey] ?: ReaderPreviewState.Idle }
            .distinctUntilChanged()

    @Synchronized
    fun currentState(memoryCacheKey: String): ReaderPreviewState = states.value[memoryCacheKey] ?: ReaderPreviewState.Idle

    @Synchronized
    fun warm(
        imageUrl: String,
        memoryCacheKey: String,
    ) {
        if (active[imageUrl]?.work?.memoryCacheKey == memoryCacheKey) return
        if (imageUrl in visibleUrls || pending.any { it.memoryCacheKey == memoryCacheKey && it !in failed }) return
        val cacheKey = MemoryCache.Key(memoryCacheKey)
        val cachedPreview = imageLoader.memoryCache?.get(cacheKey)
        cancelAll()
        if (originalCached(imageUrl)) return
        if (cachedPreview != null) imageLoader.memoryCache?.set(cacheKey, cachedPreview)
        val work = Work(imageUrl, memoryCacheKey, ReaderPrefetchKind.Preview)
        pending = listOf(work)
        pumpLocked()
    }

    @Synchronized
    fun updateWindow(
        mangaId: Long,
        chapterNumber: Double,
        pages: List<MangaPage>,
        currentPage: Int,
        visiblePages: Set<Int> = setOf(currentPage),
    ) {
        val key = ReaderPreparationKey.of(mangaId, chapterNumber)
        if (chapterKey != null && chapterKey != key) cancelAll()
        chapterKey = key
        val boundedPage = ReaderLogic.boundedPage(currentPage, pages.size)
        val previousPage = this.currentPage
        if (previousPage == null) {
            pages.getOrNull(boundedPage)?.let { target ->
                val previewKey = MemoryCache.Key(ReaderLogic.previewMemoryCacheKey(mangaId, chapterNumber, target))
                if (!originalCached(target.imageUrl) && imageLoader.memoryCache?.get(previewKey) == null) {
                    delayStartupLocked(target.imageUrl)
                }
            }
        } else if (boundedPage != previousPage) {
            direction = if (boundedPage > previousPage) 1 else -1
            releaseStartupLocked()
        }
        this.currentPage = boundedPage
        val visible = visiblePages + boundedPage
        visibleUrls = visible.mapNotNull { pages.getOrNull(it)?.imageUrl }.toSet()
        pending =
            ReaderLogic.prefetchWindow(pages, boundedPage, direction, visible).map { candidate ->
                Work(
                    imageUrl = candidate.page.imageUrl,
                    memoryCacheKey = ReaderLogic.previewMemoryCacheKey(mangaId, chapterNumber, candidate.page),
                    kind = candidate.kind,
                )
            }
        completed.retainAll(pending.toSet())
        failed.retainAll(pending.toSet())
        val retainedUrls = pending.map { it.imageUrl }.toSet() + visibleUrls
        val obsolete = active.values.filter { it.work.imageUrl !in retainedUrls }
        obsolete.forEach { running ->
            active.remove(running.work.imageUrl)
            updateStateLocked(running.work.memoryCacheKey, ReaderPreviewState.Idle)
            cancelLocked(running.job)
        }
        val retainedPreviews =
            pending.filter { it.kind == ReaderPrefetchKind.Preview }.map { it.memoryCacheKey }.toSet() +
                visible.mapNotNull { index ->
                    pages.getOrNull(index)?.let { ReaderLogic.previewMemoryCacheKey(mangaId, chapterNumber, it) }
                } + active.values.map { it.work.memoryCacheKey }
        states.value.keys.filterNot { it in retainedPreviews }.forEach { memoryKey ->
            imageLoader.memoryCache?.remove(MemoryCache.Key(memoryKey))
        }
        states.value = states.value.filterKeys { it in retainedPreviews }
        pumpLocked()
    }

    @Synchronized
    fun cancelAll() {
        releaseStartupLocked()
        val jobs = active.values.map { it.job }
        states.value.keys.forEach { imageLoader.memoryCache?.remove(MemoryCache.Key(it)) }
        active.clear()
        pending = emptyList()
        completed.clear()
        failed.clear()
        visibleUrls = emptySet()
        chapterKey = null
        currentPage = null
        direction = 1
        states.value = emptyMap()
        jobs.forEach(::cancelLocked)
    }

    private fun pumpLocked() {
        if (!scope.isActive || startupDelayJob != null) return
        while (active.values.count { it.work.imageUrl !in visibleUrls } + cancellingJobs.size < MAX_CONCURRENT_PREFETCH) {
            val work =
                pending.firstOrNull {
                    it.imageUrl !in active && it !in completed && it !in failed
                } ?: return
            val previewKey = MemoryCache.Key(work.memoryCacheKey)
            if (work.kind == ReaderPrefetchKind.Preview && originalCached(work.imageUrl)) {
                completed += work
                continue
            }
            if (work.kind == ReaderPrefetchKind.Preview && imageLoader.memoryCache?.get(previewKey) != null) {
                completed += work
                updateStateLocked(work.memoryCacheKey, ReaderPreviewState.Ready)
                continue
            }
            if (work.kind == ReaderPrefetchKind.Preview) {
                updateStateLocked(work.memoryCacheKey, ReaderPreviewState.Loading)
            }
            lateinit var job: Job
            job =
                scope.launch(start = CoroutineStart.LAZY) {
                    var succeeded = false
                    try {
                        succeeded = imageLoader.execute(request(work)) is SuccessResult
                    } finally {
                        complete(work, job, succeeded)
                    }
                }
            active[work.imageUrl] = Active(work, job)
            job.start()
        }
    }

    private fun originalCached(imageUrl: String): Boolean = imageLoader.memoryCache?.get(MemoryCache.Key(ReaderLogic.originalMemoryCacheKey(imageUrl, retry = 0))) != null

    private fun delayStartupLocked(imageUrl: String) {
        startupTargetUrl = imageUrl
        lateinit var timer: Job
        timer =
            scope.launch(start = CoroutineStart.LAZY) {
                delay(STARTUP_PREFETCH_GRACE_MS)
                synchronized(this@ReaderPreviewPreloader) {
                    if (startupDelayJob === timer) {
                        startupDelayJob = null
                        startupTargetUrl = null
                        pumpLocked()
                    }
                }
            }
        startupDelayJob = timer
        timer.start()
    }

    private fun releaseStartupLocked() {
        startupDelayJob?.cancel()
        startupDelayJob = null
        startupTargetUrl = null
    }

    private fun cancelLocked(job: Job) {
        cancellingJobs += job
        job.invokeOnCompletion {
            synchronized(this) {
                cancellingJobs -= job
                pumpLocked()
            }
        }
        job.cancel()
    }

    private fun request(work: Work): ImageRequest {
        val builder =
            ImageRequest.Builder(applicationContext)
                .data(work.imageUrl)
                .diskCacheKey(work.imageUrl)
                .readerImageRequest()
                .crossfade(false)
        return when (work.kind) {
            ReaderPrefetchKind.Preview ->
                builder.size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
                    .scale(Scale.FIT)
                    .precision(Precision.EXACT)
                    .memoryCacheKey(work.memoryCacheKey)
                    .build()
            ReaderPrefetchKind.Disk ->
                builder.size(1, 1)
                    .memoryCachePolicy(CachePolicy.DISABLED)
                    .decoderFactory(ReaderDiskOnlyDecoder.Factory())
                    .build()
        }
    }

    @Synchronized
    private fun complete(
        work: Work,
        job: Job,
        succeeded: Boolean,
    ) {
        if (active[work.imageUrl]?.job !== job) return
        active.remove(work.imageUrl)
        if (work.imageUrl == startupTargetUrl) releaseStartupLocked()
        if (succeeded) completed += work else failed += work
        if (work.kind == ReaderPrefetchKind.Preview) {
            val previewCached = imageLoader.memoryCache?.get(MemoryCache.Key(work.memoryCacheKey)) != null
            updateStateLocked(
                work.memoryCacheKey,
                if (succeeded && previewCached) ReaderPreviewState.Ready else ReaderPreviewState.Idle,
            )
        }
        pumpLocked()
    }

    private fun updateStateLocked(
        memoryCacheKey: String,
        state: ReaderPreviewState,
    ) {
        states.value =
            if (state == ReaderPreviewState.Idle) {
                states.value - memoryCacheKey
            } else {
                states.value + (memoryCacheKey to state)
            }
    }

    companion object {
        const val PREVIEW_WIDTH = 480
        const val PREVIEW_HEIGHT = 1_280
        const val MAX_CONCURRENT_PREFETCH = 2
        const val STARTUP_PREFETCH_GRACE_MS = 300L
    }
}
