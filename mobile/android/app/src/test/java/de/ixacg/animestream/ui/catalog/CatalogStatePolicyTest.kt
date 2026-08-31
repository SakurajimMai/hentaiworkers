package de.ixacg.animestream.ui.catalog

import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogStatePolicyTest {
    @Test
    fun `successful empty response leaves loading and renders empty state`() {
        assertEquals(
            CatalogPaneState.Empty,
            catalogPaneState(itemCount = 0, hasLoaded = true, loading = false, error = null),
        )
    }

    @Test
    fun `initial and active empty loads render progress`() {
        assertEquals(
            CatalogPaneState.Loading,
            catalogPaneState(itemCount = 0, hasLoaded = false, loading = false, error = null),
        )
        assertEquals(
            CatalogPaneState.Loading,
            catalogPaneState(itemCount = 0, hasLoaded = true, loading = true, error = null),
        )
    }

    @Test
    fun `content remains visible while refresh error is shown inline`() {
        assertEquals(
            CatalogPaneState.Content,
            catalogPaneState(itemCount = 2, hasLoaded = true, loading = false, error = "offline"),
        )
    }

    @Test
    fun `empty failed request renders retry state`() {
        assertEquals(
            CatalogPaneState.Error("offline"),
            catalogPaneState(itemCount = 0, hasLoaded = false, loading = false, error = "offline"),
        )
    }
}
