package de.ixacg.animestream.ui

internal data class ReaderLoadIdentity(
    val generation: Long,
    val mangaId: Long,
    val chapterNumber: Double,
) {
    fun matches(
        activeGeneration: Long,
        activeMangaId: Long?,
        activeChapterNumber: Double?,
    ): Boolean =
        generation == activeGeneration &&
            mangaId == activeMangaId &&
            chapterNumber == activeChapterNumber
}

internal fun shouldApplyReaderRestore(
    activeRequestId: String?,
    requestId: String?,
): Boolean = requestId == null || requestId != activeRequestId
