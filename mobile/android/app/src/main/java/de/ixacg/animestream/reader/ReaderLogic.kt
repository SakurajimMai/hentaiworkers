package de.ixacg.animestream.reader

import de.ixacg.animestream.core.model.MangaPage
import kotlin.math.roundToInt

data class VisibleReaderPage(
    val index: Int,
    val visiblePixels: Int,
    val totalPixels: Int,
)

internal enum class ReaderPrefetchKind {
    Preview,
    Disk,
}

internal data class ReaderPrefetchPage(val page: MangaPage, val kind: ReaderPrefetchKind)

object ReaderLogic {
    fun readingScale(scale: Float): Float = if (scale.isFinite()) scale.coerceIn(1f, MAX_READING_SCALE) else 1f

    fun boundedReadingOffsetX(
        offset: Float,
        scale: Float,
        viewportWidth: Int,
    ): Float {
        val minimum = -viewportWidth.coerceAtLeast(0) * (readingScale(scale) - 1f)
        return if (offset.isFinite()) offset.coerceIn(minimum, 0f) else 0f
    }

    fun readingOffsetX(
        offsetX: Float,
        centroidX: Float,
        panX: Float,
        previousScale: Float,
        nextScale: Float,
        viewportWidth: Int,
    ): Float =
        boundedReadingOffsetX(
            offset = centroidX - (centroidX - panX - offsetX) * readingScale(nextScale) / readingScale(previousScale),
            scale = nextScale,
            viewportWidth = viewportWidth,
        )

    fun zoomAnchorScrollOffset(
        itemSize: Int,
        itemFraction: Float,
        scaleChange: Float,
        centroidY: Float,
    ): Int = (itemSize * itemFraction * scaleChange - centroidY).roundToInt()

    fun activePage(
        pages: List<VisibleReaderPage>,
        minimumVisibleFraction: Float = 0.4f,
    ): Int? {
        val visiblePages = pages.filter { it.totalPixels > 0 && it.visiblePixels > 0 }
        return visiblePages.firstOrNull { page ->
            page.visiblePixels.toFloat() / page.totalPixels >= minimumVisibleFraction
        }?.index ?: visiblePages.maxByOrNull(VisibleReaderPage::visiblePixels)?.index
    }

    fun boundedPage(
        requested: Int,
        pageCount: Int,
    ): Int = requested.coerceIn(0, (pageCount - 1).coerceAtLeast(0))

    fun initialItemIndex(
        restoredPage: Int,
        pageCount: Int,
        hasTopAd: Boolean,
    ): Int = boundedPage(restoredPage, pageCount) + if (hasTopAd) 1 else 0

    internal fun prefetchWindow(
        pages: List<MangaPage>,
        currentPage: Int,
        direction: Int = 1,
        visiblePages: Set<Int> = setOf(currentPage),
    ): List<ReaderPrefetchPage> {
        if (pages.isEmpty()) return emptyList()
        val current = boundedPage(currentPage, pages.size)
        val step = if (direction < 0) -1 else 1
        val visibleUrls = visiblePages.mapNotNull { pages.getOrNull(it)?.imageUrl }.toSet()
        return buildList {
            for (distance in 1..FORWARD_PREFETCH_PAGES) {
                val page = pages.getOrNull(current + distance * step) ?: continue
                val kind = if (distance <= PREVIEW_PREFETCH_PAGES) ReaderPrefetchKind.Preview else ReaderPrefetchKind.Disk
                add(ReaderPrefetchPage(page, kind))
            }
            pages.getOrNull(current - step)?.let { add(ReaderPrefetchPage(it, ReaderPrefetchKind.Disk)) }
        }.filterNot { it.page.imageUrl in visibleUrls }
            .distinctBy { it.page.imageUrl }
    }

    fun targetPage(
        pages: List<MangaPage>,
        requestedPage: Int,
    ): MangaPage? = pages.getOrNull(boundedPage(requestedPage, pages.size))

    fun previewMemoryCacheKey(
        mangaId: Long,
        chapterNumber: Double,
        page: MangaPage,
    ): String =
        buildString {
            append("reader-preview:")
            append(mangaId)
            append(':')
            append(ReaderPreparationKey.of(mangaId, chapterNumber).chapter)
            append(':')
            append(page.index)
            append(':')
            append(page.imageUrl)
        }

    fun originalMemoryCacheKey(
        imageUrl: String,
        retry: Int,
    ): String = "$imageUrl-${retry.coerceAtLeast(0)}"

    fun pageFromSlider(
        previewValue: Float,
        pageCount: Int,
    ): Int {
        if (previewValue.isNaN()) return 0
        val maximum = (pageCount - 1).coerceAtLeast(0).toFloat()
        return boundedPage(previewValue.coerceIn(0f, maximum).roundToInt(), pageCount)
    }

    fun pageAspectRatio(
        width: Int,
        height: Int,
        fallback: Float = 0.72f,
    ): Float {
        if (width <= 0 || height <= 0) return fallback
        return (width.toFloat() / height).coerceIn(MIN_PAGE_ASPECT_RATIO, MAX_PAGE_ASPECT_RATIO)
    }

    fun requiresBoundedViewport(
        imageWidth: Int,
        imageHeight: Int,
        viewportWidth: Int,
        viewportHeight: Int,
        maximumReadingScale: Float = 1f,
    ): Boolean {
        if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return false
        val scaledImageHeight = imageHeight.toDouble() * viewportWidth / imageWidth
        val maximumHeight =
            minOf(
                viewportHeight.toDouble() * MAX_UNBOUNDED_VIEWPORT_HEIGHTS,
                MAX_PAGE_LAYOUT_HEIGHT.toDouble() / readingScale(maximumReadingScale),
            )
        return scaledImageHeight > maximumHeight
    }

    private const val MIN_PAGE_ASPECT_RATIO = 0.001f
    private const val MAX_PAGE_ASPECT_RATIO = 4f
    private const val MAX_UNBOUNDED_VIEWPORT_HEIGHTS = 8
    private const val MAX_PAGE_LAYOUT_HEIGHT = 24_000
    internal const val PREVIEW_PREFETCH_PAGES = 2
    internal const val FORWARD_PREFETCH_PAGES = 6
    internal const val MAX_READING_SCALE = 4f
}
