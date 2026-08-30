package de.ixacg.animestream.ui

import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.MangaSummary
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeLoadCoordinatorTest {
    @Test
    fun `anime content is published before manga completes`() {
        val coordinator = HomeLoadCoordinator(previous = null)

        val animeUpdate = coordinator.animeCompleted(Result.success(listOf(anime(1))))

        assertEquals(listOf(anime(1)), animeUpdate.state.value?.animes)
        assertEquals(emptyList<MangaSummary>(), animeUpdate.state.value?.mangas)
        assertTrue(animeUpdate.state.loading)
        assertNull(animeUpdate.state.error)
        assertTrue(animeUpdate.shouldLoadAds)

        val mangaUpdate = coordinator.mangaCompleted(Result.success(listOf(manga(2))))

        assertEquals(listOf(anime(1)), mangaUpdate.state.value?.animes)
        assertEquals(listOf(manga(2)), mangaUpdate.state.value?.mangas)
        assertFalse(mangaUpdate.state.loading)
        assertNull(mangaUpdate.state.error)
        assertFalse(mangaUpdate.shouldLoadAds)
    }

    @Test
    fun `manga content remains visible when pending anime later times out`() {
        val coordinator = HomeLoadCoordinator(previous = null)

        val mangaUpdate = coordinator.mangaCompleted(Result.success(listOf(manga(2))))

        assertEquals(listOf(manga(2)), mangaUpdate.state.value?.mangas)
        assertTrue(mangaUpdate.state.loading)
        assertNull(mangaUpdate.state.error)
        assertTrue(mangaUpdate.shouldLoadAds)

        val animeUpdate =
            coordinator.animeCompleted(
                Result.failure(IOException("服务器响应超时，请检查网络后重试")),
            )

        assertEquals(emptyList<Anime>(), animeUpdate.state.value?.animes)
        assertEquals(listOf(manga(2)), animeUpdate.state.value?.mangas)
        assertFalse(animeUpdate.state.loading)
        assertEquals("部分内容暂时不可用，请重试", animeUpdate.state.error)
        assertFalse(animeUpdate.shouldLoadAds)
    }

    @Test
    fun `first failure is suppressed while the other section is pending`() {
        val coordinator = HomeLoadCoordinator(previous = null)

        val pending = coordinator.animeCompleted(Result.failure(IOException("里番加载失败，请重试")))

        assertNull(pending.state.value)
        assertTrue(pending.state.loading)
        assertNull(pending.state.error)
        assertFalse(pending.shouldLoadAds)

        val completed = coordinator.mangaCompleted(Result.success(emptyList()))

        assertNull(completed.state.value)
        assertFalse(completed.state.loading)
        assertEquals("里番加载失败，请重试", completed.state.error)
        assertFalse(completed.shouldLoadAds)
    }

    @Test
    fun `two successful empty sections publish the normal empty state`() {
        val coordinator = HomeLoadCoordinator(previous = null)

        val pending = coordinator.mangaCompleted(Result.success(emptyList()))
        val completed = coordinator.animeCompleted(Result.success(emptyList()))

        assertNull(pending.state.value)
        assertTrue(pending.state.loading)
        assertNull(pending.state.error)
        assertEquals(HomeContent(), completed.state.value)
        assertFalse(completed.state.loading)
        assertNull(completed.state.error)
        assertTrue(completed.shouldLoadAds)
    }

    @Test
    fun `partial refresh failure preserves old section with an inline retry error`() {
        val previous = HomeContent(animes = listOf(anime(1)), mangas = listOf(manga(2)))
        val coordinator = HomeLoadCoordinator(previous)

        coordinator.mangaCompleted(Result.failure(IOException("漫画加载失败，请重试")))
        val completed = coordinator.animeCompleted(Result.success(listOf(anime(3))))

        assertEquals(listOf(anime(3)), completed.state.value?.animes)
        assertEquals(previous.mangas, completed.state.value?.mangas)
        assertFalse(completed.state.loading)
        assertEquals("部分内容暂时不可用，请重试", completed.state.error)
        assertTrue(completed.shouldLoadAds)
    }

    @Test
    fun `both failures preserve old content and expose a final retry error`() {
        val previous = HomeContent(animes = listOf(anime(1)), mangas = listOf(manga(2)))
        val coordinator = HomeLoadCoordinator(previous)

        val pending = coordinator.mangaCompleted(Result.failure(IOException("漫画加载失败，请重试")))
        val completed = coordinator.animeCompleted(Result.failure(IOException("里番加载失败，请重试")))

        assertEquals(previous, pending.state.value)
        assertTrue(pending.state.loading)
        assertNull(pending.state.error)
        assertEquals(previous, completed.state.value)
        assertFalse(completed.state.loading)
        assertEquals("里番加载失败，请重试", completed.state.error)
        assertFalse(completed.shouldLoadAds)
    }

    private fun anime(id: Long) = Anime(id = id, title = "Anime $id")

    private fun manga(id: Long) = MangaSummary(id = id, title = "Manga $id")
}
