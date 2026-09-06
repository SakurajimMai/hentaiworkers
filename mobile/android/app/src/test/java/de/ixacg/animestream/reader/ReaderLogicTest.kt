package de.ixacg.animestream.reader

import de.ixacg.animestream.core.model.MangaPage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderLogicTest {
    @Test
    fun `chapter zoom keeps the content under the moving pinch center`() {
        val oldLeft = -100f
        val oldCenter = 250f
        val newCenter = 280f
        val oldScale = 1.5f
        val newScale = 3f
        val nextLeft =
            ReaderLogic.readingOffsetX(
                offsetX = oldLeft,
                centroidX = newCenter,
                panX = newCenter - oldCenter,
                previousScale = oldScale,
                nextScale = newScale,
                viewportWidth = 400,
            )

        assertEquals((oldCenter - oldLeft) / oldScale, (newCenter - nextLeft) / newScale, 0.001f)
        val scrollOffset = ReaderLogic.zoomAnchorScrollOffset(1_000, 0.6f, newScale / oldScale, 480f)
        assertEquals(480f, 2_000f * 0.6f - scrollOffset, 0.001f)
    }

    @Test
    fun `reading zoom limits never reveal a horizontal gap and reset its offset at fit width`() {
        assertEquals(1f, ReaderLogic.readingScale(0.5f), 0f)
        assertEquals(4f, ReaderLogic.readingScale(100f), 0f)
        assertEquals(1f, ReaderLogic.readingScale(Float.NaN), 0f)
        assertEquals(-1_200f, ReaderLogic.boundedReadingOffsetX(-10_000f, 4f, 400), 0f)
        assertEquals(0f, ReaderLogic.boundedReadingOffsetX(100f, 4f, 400), 0f)
        assertEquals(0f, ReaderLogic.boundedReadingOffsetX(-100f, 1f, 400), 0f)
        assertEquals(0f, ReaderLogic.boundedReadingOffsetX(Float.NaN, 3f, 400), 0f)
    }

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
    fun `window prepares two bounded previews and farther files without a readiness gate`() {
        val pages = (0 until 240).map { MangaPage(index = it, imageUrl = "page-$it") }
        val window = ReaderLogic.prefetchWindow(pages, currentPage = 120)

        assertEquals(listOf(121, 122, 123, 124, 125, 126, 119), window.map { it.page.index })
        assertEquals(listOf(121, 122), window.filter { it.kind == ReaderPrefetchKind.Preview }.map { it.page.index })
        assertEquals(5, window.count { it.kind == ReaderPrefetchKind.Disk })
        assertTrue(window.none { it.page.index == 0 || it.page.index == 120 })
    }

    @Test
    fun `reverse reading mirrors the bounded lookahead window`() {
        val pages = (0 until 40).map { MangaPage(index = it, imageUrl = "page-$it") }
        val window = ReaderLogic.prefetchWindow(pages, currentPage = 20, direction = -1)

        assertEquals(listOf(19, 18, 17, 16, 15, 14, 21), window.map { it.page.index })
        assertEquals(listOf(19, 18), window.filter { it.kind == ReaderPrefetchKind.Preview }.map { it.page.index })
    }

    @Test
    fun `visible urls are excluded from speculative work and repeated urls are unique`() {
        val pages =
            (0 until 40).map { index ->
                MangaPage(index = index, imageUrl = if (index == 4) "page-3" else "page-$index")
            }
        val window = ReaderLogic.prefetchWindow(pages, currentPage = 0, visiblePages = setOf(0, 1))

        assertEquals(listOf(2, 3, 5, 6), window.map { it.page.index })
        assertEquals(window.size, window.map { it.page.imageUrl }.distinct().size)
    }

    @Test
    fun `window clips at chapter edges and never opens an entire long chapter`() {
        val pages = (0 until 240).map { MangaPage(index = it, imageUrl = "page-$it") }

        assertTrue(ReaderLogic.prefetchWindow(emptyList(), currentPage = 0).isEmpty())
        assertEquals(listOf(238), ReaderLogic.prefetchWindow(pages, currentPage = 239).map { it.page.index })
        assertEquals(listOf(1), ReaderLogic.prefetchWindow(pages, currentPage = 0, direction = -1).map { it.page.index })
        pages.indices.forEach { current ->
            assertTrue(ReaderLogic.prefetchWindow(pages, current).size <= ReaderLogic.FORWARD_PREFETCH_PAGES + 1)
        }
    }

    @Test
    fun `restored target selection starts at requested page rather than page zero`() {
        val pages = (0 until 240).map { MangaPage(index = it, imageUrl = "page-$it") }

        assertEquals("page-200", ReaderLogic.targetPage(pages, requestedPage = 200)?.imageUrl)
        assertEquals("page-239", ReaderLogic.targetPage(pages, requestedPage = 999)?.imageUrl)
        assertNull(ReaderLogic.targetPage(emptyList(), requestedPage = 200))
    }

    @Test
    fun `preview keys are stable and isolated by chapter and page`() {
        val page = MangaPage(index = 3, imageUrl = "https://example.test/page.jpg")

        assertEquals(
            ReaderLogic.previewMemoryCacheKey(8, 1.0, page),
            ReaderLogic.previewMemoryCacheKey(8, 1.00, page),
        )
        assertNotEquals(
            ReaderLogic.previewMemoryCacheKey(8, 1.0, page),
            ReaderLogic.previewMemoryCacheKey(8, 2.0, page),
        )
        assertNotEquals(
            ReaderLogic.previewMemoryCacheKey(8, 1.0, page),
            ReaderLogic.previewMemoryCacheKey(8, 1.0, page.copy(index = 4)),
        )
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
        assertTrue(ReaderLogic.requiresBoundedViewport(1_000, 10_000, 4_320, 2_400))
        assertTrue(ReaderLogic.requiresBoundedViewport(1_000, 30_000, 1_080, 5_000))
    }

    @Test
    fun `reader viewport mode stays fixed throughout the supported zoom range`() {
        for (scale in listOf(1f, 2f, 3f, ReaderLogic.MAX_READING_SCALE)) {
            val scaledWidth = 400f * scale
            assertFalse(
                ReaderLogic.requiresBoundedViewport(
                    imageWidth = 1_000,
                    imageHeight = 6_000,
                    viewportWidth = (scaledWidth / scale).toInt(),
                    viewportHeight = 800,
                    maximumReadingScale = ReaderLogic.MAX_READING_SCALE,
                ),
            )
            assertTrue(
                ReaderLogic.requiresBoundedViewport(
                    imageWidth = 1_000,
                    imageHeight = 20_000,
                    viewportWidth = (scaledWidth / scale).toInt(),
                    viewportHeight = 1_200,
                    maximumReadingScale = ReaderLogic.MAX_READING_SCALE,
                ),
            )
        }
    }
}
