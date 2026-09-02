package de.ixacg.animestream.reader

import java.math.BigDecimal
import java.util.LinkedHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class ReaderPreparationKey private constructor(
    val mangaId: Long,
    val chapter: String,
) {
    companion object {
        fun of(
            mangaId: Long,
            chapterNumber: Double,
        ): ReaderPreparationKey {
            require(chapterNumber.isFinite()) { "Chapter number must be finite" }
            val chapter = BigDecimal.valueOf(chapterNumber).stripTrailingZeros().toPlainString()
            return ReaderPreparationKey(mangaId = mangaId, chapter = chapter)
        }
    }
}

internal class ReaderPreparationStore<T : Any>(
    private val scope: CoroutineScope,
    private val ttlMillis: Long = DEFAULT_TTL_MILLIS,
    private val capacity: Int = DEFAULT_CAPACITY,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    init {
        require(ttlMillis > 0) { "TTL must be positive" }
        require(capacity > 0) { "Capacity must be positive" }
    }

    private data class CacheEntry<T>(
        val value: T,
        val cachedAtMillis: Long,
    )

    private sealed interface Selection<out T> {
        data class Cached<T>(val value: T) : Selection<T>

        data class Pending<T>(val deferred: Deferred<Result<T>>) : Selection<T>
    }

    private val mutex = Mutex()
    private val completed = LinkedHashMap<ReaderPreparationKey, CacheEntry<T>>(capacity, 0.75f, true)
    private val inFlight = mutableMapOf<ReaderPreparationKey, Deferred<Result<T>>>()

    suspend fun getOrLoad(
        key: ReaderPreparationKey,
        loader: suspend () -> T,
    ): T {
        val selection: Selection<T> =
            mutex.withLock {
                evictExpired(nowMillis())
                completed[key]?.let { return@withLock Selection.Cached(it.value) }
                Selection.Pending(inFlight[key] ?: createFlight(key, loader))
            }
        return when (selection) {
            is Selection.Cached -> selection.value
            is Selection.Pending -> selection.deferred.await().getOrThrow()
        }
    }

    private fun createFlight(
        key: ReaderPreparationKey,
        loader: suspend () -> T,
    ): Deferred<Result<T>> {
        lateinit var deferred: Deferred<Result<T>>
        deferred =
            scope.async(start = CoroutineStart.LAZY) {
                val result =
                    try {
                        Result.success(loader())
                    } catch (error: CancellationException) {
                        mutex.withLock {
                            if (inFlight[key] === deferred) inFlight.remove(key)
                        }
                        throw error
                    } catch (error: Throwable) {
                        Result.failure(error)
                    }
                mutex.withLock {
                    if (inFlight[key] === deferred) {
                        inFlight.remove(key)
                        result.getOrNull()?.let { value ->
                            completed[key] = CacheEntry(value, nowMillis())
                            trimToCapacity()
                        }
                    }
                }
                result
            }
        inFlight[key] = deferred
        deferred.start()
        return deferred
    }

    private fun evictExpired(now: Long) {
        val iterator = completed.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next().value
            if (now - entry.cachedAtMillis >= ttlMillis) iterator.remove()
        }
    }

    private fun trimToCapacity() {
        while (completed.size > capacity) {
            val oldest = completed.entries.iterator()
            if (!oldest.hasNext()) return
            oldest.next()
            oldest.remove()
        }
    }

    companion object {
        const val DEFAULT_TTL_MILLIS = 30_000L
        const val DEFAULT_CAPACITY = 2
    }
}
