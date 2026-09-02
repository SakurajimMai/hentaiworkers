package de.ixacg.animestream.reader

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReaderPreparationStoreTest {
    @Test
    fun `matching callers share one in-flight chapter request`() =
        runTest {
            val store = store<Int>()
            val gate = CompletableDeferred<Unit>()
            var loads = 0
            val key = ReaderPreparationKey.of(mangaId = 8, chapterNumber = 1.0)

            val first =
                async {
                    store.getOrLoad(key) {
                        loads++
                        gate.await()
                        42
                    }
                }
            runCurrent()
            val second =
                async {
                    store.getOrLoad(key) {
                        loads++
                        99
                    }
                }
            runCurrent()

            assertEquals(1, loads)
            gate.complete(Unit)
            assertEquals(42, first.await())
            assertEquals(42, second.await())
        }

    @Test
    fun `completed cache expires and evicts least recently used chapter`() =
        runTest {
            val store = store<Int>(ttlMillis = 1_000, capacity = 2)
            val first = ReaderPreparationKey.of(1, 1.0)
            val second = ReaderPreparationKey.of(1, 2.0)
            val third = ReaderPreparationKey.of(1, 3.0)
            var loads = 0

            suspend fun load(key: ReaderPreparationKey): Int = store.getOrLoad(key) { ++loads }

            assertEquals(1, load(first))
            assertEquals(2, load(second))
            assertEquals(1, load(first))
            assertEquals(3, load(third))
            assertEquals(4, load(second))
            advanceTimeBy(1_000)
            assertEquals(5, load(second))
        }

    @Test
    fun `failed preparation is removed so the next call retries`() =
        runTest {
            val store = store<Int>()
            val key = ReaderPreparationKey.of(2, 4.0)
            var loads = 0

            runCatching {
                store.getOrLoad(key) {
                    loads++
                    throw IOException("temporary")
                }
            }
            assertEquals(
                7,
                store.getOrLoad(key) {
                    loads++
                    7
                },
            )
            assertEquals(2, loads)
        }

    @Test
    fun `chapter key is normalized and isolated by manga`() {
        assertEquals(ReaderPreparationKey.of(5, 1.0), ReaderPreparationKey.of(5, 1.00))
        assertNotEquals(ReaderPreparationKey.of(5, 1.0), ReaderPreparationKey.of(6, 1.0))
    }

    private fun <T : Any> kotlinx.coroutines.test.TestScope.store(
        ttlMillis: Long = ReaderPreparationStore.DEFAULT_TTL_MILLIS,
        capacity: Int = ReaderPreparationStore.DEFAULT_CAPACITY,
    ): ReaderPreparationStore<T> =
        ReaderPreparationStore(
            scope = this,
            ttlMillis = ttlMillis,
            capacity = capacity,
            nowMillis = { testScheduler.currentTime },
        )
}
