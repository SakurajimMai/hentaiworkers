package de.ixacg.animestream.reader

import de.ixacg.animestream.core.model.MangaPage
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
    fun `initial list item starts at restored page with optional ad offset`() {
        assertEquals(
            7,
            ReaderLogic.initialItemIndex(restoredPage = 7, pageCount = 20, hasTopAd = false),
        )
        assertEquals(
            8,
            ReaderLogic.initialItemIndex(restoredPage = 7, pageCount = 20, hasTopAd = true),
        )
        assertEquals(
            20,
            ReaderLogic.initialItemIndex(restoredPage = 99, pageCount = 20, hasTopAd = true),
        )
        assertEquals(
            0,
            ReaderLogic.initialItemIndex(restoredPage = 7, pageCount = 0, hasTopAd = false),
        )
    }

    @Test
    fun `prefetch waits for current page display and returns only next two unscheduled urls`() {
        val pages = (0 until 6).map { MangaPage(index = it, imageUrl = "https://example.test/$it.jpg") }

        assertTrue(
            ReaderLogic.prefetchPages(
                pages = pages,
                currentPage = 2,
                currentPageDisplayed = false,
                scheduledUrls = emptySet(),
            ).isEmpty(),
        )
        assertEquals(
            listOf("https://example.test/3.jpg", "https://example.test/4.jpg"),
            ReaderLogic.prefetchPages(
                pages = pages,
                currentPage = 2,
                currentPageDisplayed = true,
                scheduledUrls = emptySet(),
            ).map(MangaPage::imageUrl),
        )
        assertEquals(
            listOf("https://example.test/4.jpg"),
            ReaderLogic.prefetchPages(
                pages = pages,
                currentPage = 2,
                currentPageDisplayed = true,
                scheduledUrls = setOf("https://example.test/3.jpg"),
            ).map(MangaPage::imageUrl),
        )
    }

    @Test
    fun `prefetch registry reserves each url once and cancels retained requests`() {
        val registry = ReaderPrefetchRegistry()
        var cancellations = 0

        assertTrue(registry.reserve("page-1"))
        assertFalse(registry.reserve("page-1"))
        assertTrue(registry.reserve("page-2"))
        registry.register("page-1") { cancellations++ }
        registry.register("page-2") { cancellations++ }

        assertEquals(setOf("page-1", "page-2"), registry.scheduledUrls)
        registry.cancelAll()
        assertEquals(2, cancellations)
        assertTrue(registry.scheduledUrls.isEmpty())
    }

    @Test
    fun `forty sequential pages enqueue each future url at most once`() {
        val pages = (0 until 40).map { MangaPage(index = it, imageUrl = "page-$it") }
        val registry = ReaderPrefetchRegistry()
        var enqueueCount = 0

        pages.indices.forEach { currentPage ->
            ReaderLogic.prefetchPages(
                pages = pages,
                currentPage = currentPage,
                currentPageDisplayed = true,
                scheduledUrls = registry.scheduledUrls,
            ).forEach { page ->
                if (registry.reserve(page.imageUrl)) {
                    enqueueCount++
                    registry.register(page.imageUrl) { }
                }
            }
        }

        assertEquals(39, enqueueCount)
        assertEquals(39, registry.scheduledUrls.size)
        assertFalse("page-0" in registry.scheduledUrls)
    }

    @Test
    fun `maps slider preview to nearest bounded page`() {
        assertEquals(0, ReaderLogic.pageFromSlider(-10f, 6))
        assertEquals(0, ReaderLogic.pageFromSlider(0.49f, 6))
        assertEquals(1, ReaderLogic.pageFromSlider(0.5f, 6))
        assertEquals(3, ReaderLogic.pageFromSlider(3.49f, 6))
        assertEquals(4, ReaderLogic.pageFromSlider(3.5f, 6))
        assertEquals(5, ReaderLogic.pageFromSlider(99f, 6))
        assertEquals(0, ReaderLogic.pageFromSlider(Float.NaN, 6))
        assertEquals(0, ReaderLogic.pageFromSlider(3f, 0))
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
