package de.ixacg.animestream.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderLogicTest {
    @Test
    fun `selects first page at least forty percent visible`() {
        assertEquals(
            3,
            ReaderLogic.activePage(
                listOf(
                    VisibleReaderPage(index = 2, visiblePixels = 39, totalPixels = 100),
                    VisibleReaderPage(index = 3, visiblePixels = 40, totalPixels = 100),
                    VisibleReaderPage(index = 4, visiblePixels = 90, totalPixels = 100),
                ),
            ),
        )
        assertNull(ReaderLogic.activePage(listOf(VisibleReaderPage(1, 0, 100))))
    }

    @Test
    fun `falls back to most visible page when a long page cannot reach forty percent`() {
        assertEquals(
            2,
            ReaderLogic.activePage(
                listOf(
                    VisibleReaderPage(index = 1, visiblePixels = 600, totalPixels = 20_000),
                    VisibleReaderPage(index = 2, visiblePixels = 900, totalPixels = 80_000),
                ),
            ),
        )
    }

    @Test
    fun `bounds restored progress to available pages`() {
        assertEquals(0, ReaderLogic.boundedPage(-5, 12))
        assertEquals(11, ReaderLogic.boundedPage(50, 12))
        assertEquals(0, ReaderLogic.boundedPage(1, 0))
    }

    @Test
    fun `keeps extreme long page aspect ratio without allocating its bitmap`() {
        assertEquals(0.004f, ReaderLogic.pageAspectRatio(width = 1_000, height = 250_000), 0.00001f)
        assertEquals(0.001f, ReaderLogic.pageAspectRatio(width = 1_000, height = 2_000_000), 0.00001f)
        assertEquals(0.72f, ReaderLogic.pageAspectRatio(width = 0, height = 0), 0f)
    }

    @Test
    fun `uses finite viewport only for extreme long pages`() {
        assertFalse(
            ReaderLogic.requiresBoundedViewport(
                imageWidth = 1_000,
                imageHeight = 10_000,
                viewportWidth = 1_080,
                viewportHeight = 2_400,
            ),
        )
        assertTrue(
            ReaderLogic.requiresBoundedViewport(
                imageWidth = 1_000,
                imageHeight = 250_000,
                viewportWidth = 1_080,
                viewportHeight = 2_400,
            ),
        )
        assertTrue(
            ReaderLogic.requiresBoundedViewport(
                imageWidth = 1_000,
                imageHeight = 2_000_000,
                viewportWidth = 1_080,
                viewportHeight = 2_400,
            ),
        )
        assertFalse(ReaderLogic.requiresBoundedViewport(0, 0, 1_080, 2_400))
    }
}
