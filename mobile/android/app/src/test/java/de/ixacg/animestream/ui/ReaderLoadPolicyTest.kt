package de.ixacg.animestream.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderLoadPolicyTest {
    @Test
    fun `restored page applies only for a new navigation entry`() {
        assertFalse(shouldApplyReaderRestore(activeRequestId = "entry-1", requestId = "entry-1"))
        assertTrue(shouldApplyReaderRestore(activeRequestId = "entry-1", requestId = "entry-2"))
        assertTrue(shouldApplyReaderRestore(activeRequestId = "entry-1", requestId = null))
    }

    @Test
    fun `reader enhancement requires matching generation manga and chapter`() {
        val identity = ReaderLoadIdentity(generation = 4, mangaId = 18, chapterNumber = 3.0)

        assertTrue(
            identity.matches(activeGeneration = 4, activeMangaId = 18, activeChapterNumber = 3.0),
        )
        assertFalse(
            identity.matches(activeGeneration = 5, activeMangaId = 18, activeChapterNumber = 3.0),
        )
        assertFalse(
            identity.matches(activeGeneration = 4, activeMangaId = 19, activeChapterNumber = 3.0),
        )
        assertFalse(
            identity.matches(activeGeneration = 4, activeMangaId = 18, activeChapterNumber = 4.0),
        )
        assertFalse(
            identity.matches(activeGeneration = 4, activeMangaId = null, activeChapterNumber = null),
        )
    }
}
