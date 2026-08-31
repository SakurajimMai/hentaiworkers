package de.ixacg.animestream.ui

internal fun isCurrentCatalogRequest(
    requestGeneration: Long,
    currentGeneration: Long,
): Boolean = requestGeneration == currentGeneration

internal fun shouldAppendCatalogPage(
    requestGeneration: Long,
    currentGeneration: Long,
    currentPage: Int,
    responsePage: Int,
): Boolean =
    isCurrentCatalogRequest(requestGeneration, currentGeneration) &&
        responsePage > currentPage
