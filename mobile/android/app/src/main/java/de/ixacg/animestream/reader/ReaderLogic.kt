package de.ixacg.animestream.reader

import kotlin.math.roundToInt

data class VisibleReaderPage(
    val index: Int,
    val visiblePixels: Int,
    val totalPixels: Int,
)

object ReaderLogic {
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
    ): Boolean {
        if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return false
        val scaledImageHeight = imageHeight.toDouble() * viewportWidth / imageWidth
        return scaledImageHeight > viewportHeight.toDouble() * MAX_UNBOUNDED_VIEWPORT_HEIGHTS
    }

    private const val MIN_PAGE_ASPECT_RATIO = 0.001f
    private const val MAX_PAGE_ASPECT_RATIO = 4f
    private const val MAX_UNBOUNDED_VIEWPORT_HEIGHTS = 8
}
