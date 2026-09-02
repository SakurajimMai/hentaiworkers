package de.ixacg.animestream.reader

import de.ixacg.animestream.core.model.MangaPage
import kotlin.math.roundToInt

data class VisibleReaderPage(
    val index: Int,
    val visiblePixels: Int,
    val totalPixels: Int,
)

internal enum class ReaderPageReadiness {
    Loading,
    Preview,
    Full,
}

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

    fun initialItemIndex(
        restoredPage: Int,
        pageCount: Int,
        hasTopAd: Boolean,
    ): Int = boundedPage(restoredPage, pageCount) + if (hasTopAd) 1 else 0

    internal fun prefetchPages(
        pages: List<MangaPage>,
        currentPage: Int,
        readiness: ReaderPageReadiness,
        scheduledUrls: Set<String>,
    ): List<MangaPage> {
        val window =
            when (readiness) {
                ReaderPageReadiness.Loading -> 0
                ReaderPageReadiness.Preview -> 1
                ReaderPageReadiness.Full -> 2
            }
        if (pages.isEmpty() || window == 0) return emptyList()
        val start = boundedPage(currentPage, pages.size) + 1
        return pages.drop(start)
            .take(window)
            .filterNot { it.imageUrl in scheduledUrls }
            .distinctBy(MangaPage::imageUrl)
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

    internal fun shouldWaitForPreparedPreview(
        previewState: ReaderPreviewState,
        originalCached: Boolean,
    ): Boolean = previewState == ReaderPreviewState.Loading && !originalCached

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

internal class ReaderPrefetchRegistry {
    private val scheduled = linkedSetOf<String>()
    private val completed = mutableSetOf<String>()
    private val cancellations = linkedMapOf<String, () -> Unit>()

    val scheduledUrls: Set<String>
        get() = scheduled.toSet()

    fun reserve(url: String): Boolean = scheduled.add(url)

    fun register(
        url: String,
        cancel: () -> Unit,
    ) {
        if (url in scheduled && url !in completed) {
            cancellations[url] = cancel
        } else {
            cancel()
        }
    }

    fun succeed(url: String) {
        if (url in scheduled) completed += url
        cancellations.remove(url)
    }

    fun fail(url: String) {
        scheduled.remove(url)
        completed.remove(url)
        cancellations.remove(url)
    }

    fun cancelAll() {
        cancellations.values.forEach { cancel -> runCatching(cancel) }
        cancellations.clear()
        scheduled.clear()
        completed.clear()
    }
}
