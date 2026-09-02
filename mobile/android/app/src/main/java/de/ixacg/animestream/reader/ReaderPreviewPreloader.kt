package de.ixacg.animestream.reader

import android.content.Context
import coil.ImageLoader
import coil.memory.MemoryCache
import coil.request.ImageRequest
import coil.request.SuccessResult
import java.util.LinkedHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
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
    private val applicationContext = context.applicationContext
    private val states = MutableStateFlow<Map<String, ReaderPreviewState>>(emptyMap())
    private var activeKey: String? = null
    private var activeJob: Job? = null

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
        if (activeKey == memoryCacheKey && activeJob?.isActive == true) return

        val cacheKey = MemoryCache.Key(memoryCacheKey)
        cancelActiveLocked()
        val originalCacheKey = MemoryCache.Key(ReaderLogic.originalMemoryCacheKey(imageUrl, retry = 0))
        if (imageLoader.memoryCache?.get(originalCacheKey) != null) {
            updateStateLocked(memoryCacheKey, ReaderPreviewState.Idle)
            return
        }
        if (imageLoader.memoryCache?.get(cacheKey) != null) {
            updateStateLocked(memoryCacheKey, ReaderPreviewState.Ready)
            return
        }

        updateStateLocked(memoryCacheKey, ReaderPreviewState.Loading)
        lateinit var job: Job
        job =
            scope.launch(start = CoroutineStart.LAZY) {
                var completedState = ReaderPreviewState.Idle
                try {
                    val result =
                        imageLoader.execute(
                            ImageRequest.Builder(applicationContext)
                                .data(imageUrl)
                                .size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
                                .memoryCacheKey(cacheKey)
                                .diskCacheKey(imageUrl)
                                .crossfade(false)
                                .build(),
                        )
                    if (result is SuccessResult && imageLoader.memoryCache?.get(cacheKey) != null) {
                        completedState = ReaderPreviewState.Ready
                    }
                } finally {
                    complete(memoryCacheKey, job, completedState)
                }
            }
        activeKey = memoryCacheKey
        activeJob = job
        job.start()
    }

    @Synchronized
    private fun complete(
        memoryCacheKey: String,
        job: Job,
        completedState: ReaderPreviewState,
    ) {
        if (activeJob !== job) return
        activeKey = null
        activeJob = null
        updateStateLocked(memoryCacheKey, completedState)
    }

    private fun cancelActiveLocked() {
        val previousKey = activeKey
        activeKey = null
        activeJob?.cancel()
        activeJob = null
        if (previousKey != null && states.value[previousKey] == ReaderPreviewState.Loading) {
            updateStateLocked(previousKey, ReaderPreviewState.Idle)
        }
    }

    private fun updateStateLocked(
        memoryCacheKey: String,
        state: ReaderPreviewState,
    ) {
        val updated = LinkedHashMap(states.value)
        updated.remove(memoryCacheKey)
        if (state != ReaderPreviewState.Idle) updated[memoryCacheKey] = state
        while (updated.size > MAX_TRACKED_STATES) {
            updated.entries.iterator().run {
                next()
                remove()
            }
        }
        states.value = updated
    }

    companion object {
        const val PREVIEW_WIDTH = 480
        const val PREVIEW_HEIGHT = 1_280
        private const val MAX_TRACKED_STATES = 4
    }
}
