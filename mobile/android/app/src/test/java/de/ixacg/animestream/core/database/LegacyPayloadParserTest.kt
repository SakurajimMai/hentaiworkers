package de.ixacg.animestream.core.database

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegacyPayloadParserTest {
    @Test
    fun `imports valid rows while skipping malformed rows independently`() {
        val payload =
            LegacyPayloadParser.parse(
                mapOf(
                    LegacyPayloadParser.ANIME_HISTORY to
                        """[{"id":7,"title":"A","watchedAt":90},{"id":"bad","title":"B"},{"id":8}]""",
                    LegacyPayloadParser.MANGA_HISTORY to
                        """[{"id":9,"title":"M","chapterNumber":2,"pageIndex":4,"readAt":100}]""",
                    LegacyPayloadParser.ANIME_FAVORITES to "not-json",
                ),
                now = { 500L },
            )

        assertEquals(listOf(7L), payload.animeHistory.map { it.id })
        assertEquals(9L, payload.mangaHistory.single().id)
        assertEquals(4, payload.mangaHistory.single().pageIndex)
        assertEquals(emptyList<AnimeFavoriteEntity>(), payload.animeFavorites)
        assertNull(payload.cookie)
    }
}
