package de.ixacg.animestream.ui

import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.MangaSummary
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeContentResolverTest {
    @Test
    fun `successful anime refresh preserves previous manga when manga fails`() {
        val previous = HomeContent(animes = listOf(anime(1)), mangas = listOf(manga(2)))

        val result =
            resolveHomeLoad(
                previous = previous,
                animeResult = Result.success(listOf(anime(3))),
                mangaResult = Result.failure(IOException("漫画加载失败，请重试")),
            )

        assertEquals(listOf(anime(3)), result.value?.animes)
        assertEquals(previous.mangas, result.value?.mangas)
        assertNull(result.error)
    }

    @Test
    fun `first anime failure still exposes error while showing manga`() {
        val result =
            resolveHomeLoad(
                previous = null,
                animeResult = Result.failure(IOException("服务器响应超时，请检查网络后重试")),
                mangaResult = Result.success(listOf(manga(2))),
            )

        assertEquals(emptyList<Anime>(), result.value?.animes)
        assertEquals(listOf(manga(2)), result.value?.mangas)
        assertEquals("服务器响应超时，请检查网络后重试", result.error)
    }

    @Test
    fun `both failures preserve displayed content and prefer anime error`() {
        val previous = HomeContent(animes = listOf(anime(1)), mangas = listOf(manga(2)))

        val result =
            resolveHomeLoad(
                previous = previous,
                animeResult = Result.failure(IOException("里番加载失败，请重试")),
                mangaResult = Result.failure(IOException("漫画加载失败，请重试")),
            )

        assertEquals(previous, result.value)
        assertEquals("里番加载失败，请重试", result.error)
    }

    @Test
    fun `empty secondary success does not hide first-load anime failure`() {
        val result =
            resolveHomeLoad(
                previous = null,
                animeResult = Result.failure(IOException("里番加载失败，请重试")),
                mangaResult = Result.success(emptyList()),
            )

        assertNull(result.value)
        assertEquals("里番加载失败，请重试", result.error)
    }

    private fun anime(id: Long) = Anime(id = id, title = "Anime $id")

    private fun manga(id: Long) = MangaSummary(id = id, title = "Manga $id")
}
