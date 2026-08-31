package de.ixacg.animestream.ui.catalog

internal sealed interface CatalogPaneState {
    data object Content : CatalogPaneState

    data object Loading : CatalogPaneState

    data object Empty : CatalogPaneState

    data class Error(val message: String) : CatalogPaneState
}

internal fun catalogPaneState(
    itemCount: Int,
    hasLoaded: Boolean,
    loading: Boolean,
    error: String?,
): CatalogPaneState =
    when {
        itemCount > 0 -> CatalogPaneState.Content
        loading -> CatalogPaneState.Loading
        error != null -> CatalogPaneState.Error(error)
        hasLoaded -> CatalogPaneState.Empty
        else -> CatalogPaneState.Loading
    }
