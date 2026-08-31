package de.ixacg.animestream.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogRequestPolicyTest {
    @Test
    fun `only the active filter generation may commit`() {
        assertTrue(isCurrentCatalogRequest(requestGeneration = 4, currentGeneration = 4))
        assertFalse(isCurrentCatalogRequest(requestGeneration = 3, currentGeneration = 4))
    }

    @Test
    fun `pagination accepts only a forward page from the active generation`() {
        assertTrue(
            shouldAppendCatalogPage(
                requestGeneration = 4,
                currentGeneration = 4,
                currentPage = 2,
                responsePage = 3,
            ),
        )
        assertFalse(
            shouldAppendCatalogPage(
                requestGeneration = 3,
                currentGeneration = 4,
                currentPage = 2,
                responsePage = 3,
            ),
        )
        assertFalse(
            shouldAppendCatalogPage(
                requestGeneration = 4,
                currentGeneration = 4,
                currentPage = 3,
                responsePage = 3,
            ),
        )
        assertFalse(
            shouldAppendCatalogPage(
                requestGeneration = 4,
                currentGeneration = 4,
                currentPage = 3,
                responsePage = 2,
            ),
        )
    }
}
