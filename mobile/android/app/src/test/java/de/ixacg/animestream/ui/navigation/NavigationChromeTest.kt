package de.ixacg.animestream.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationChromeTest {
    @Test
    fun `phone catalog tabs keep the bottom bar`() {
        MAIN_DESTINATION_ROUTES.forEach { route ->
            val chrome = navigationChrome(route, PHONE_WIDTH_DP)
            assertTrue(route, chrome.showBottomBar)
            assertFalse(route, chrome.showRail)
            assertFalse(route, chrome.immersive)
            assertTrue(route, chrome.insetTop)
            assertTrue(route, chrome.insetStart)
            assertTrue(route, chrome.insetEnd)
            assertFalse(route, chrome.insetBottom)
        }
    }

    @Test
    fun `tablet catalog tabs keep the rail`() {
        val chrome = navigationChrome("manga", TABLET_WIDTH_DP)
        assertFalse(chrome.showBottomBar)
        assertTrue(chrome.showRail)
        assertFalse(chrome.immersive)
        assertTrue(chrome.insetTop)
        assertFalse(chrome.insetStart)
        assertTrue(chrome.insetEnd)
        assertTrue(chrome.insetBottom)
    }

    @Test
    fun `opening manga detail hides chrome without becoming immersive`() {
        val catalog = navigationChrome("manga", PHONE_WIDTH_DP)
        val detail = navigationChrome("manga-detail/{mangaId}", PHONE_WIDTH_DP)
        assertTrue(catalog.showBottomBar)
        assertFalse(detail.showBottomBar)
        assertFalse(detail.showRail)
        assertFalse(detail.immersive)
        assertTrue(detail.insetTop)
        assertTrue(detail.insetStart)
        assertTrue(detail.insetEnd)
        assertTrue(detail.insetBottom)
    }

    @Test
    fun `manga detail is not treated as the manga tab`() {
        assertTrue(isMainDestination("manga"))
        assertFalse(isMainDestination("manga-detail/{mangaId}"))
        assertFalse(isMainDestination("manga-detail/18"))
    }

    @Test
    fun `tablet detail hides the rail and keeps host padding`() {
        val catalog = navigationChrome("home", TABLET_WIDTH_DP)
        val detail = navigationChrome("anime/{animeId}", TABLET_WIDTH_DP)
        assertTrue(catalog.showRail)
        assertFalse(detail.showRail)
        assertFalse(detail.showBottomBar)
        assertFalse(detail.immersive)
        assertTrue(detail.insetBottom)
    }

    @Test
    fun `reader and player are immersive without chrome`() {
        listOf(
            "reader/{mangaId}/{chapter}?page={page}",
            "player/{animeId}",
        ).forEach { route ->
            val chrome = navigationChrome(route, PHONE_WIDTH_DP)
            assertTrue(route, chrome.immersive)
            assertFalse(route, chrome.showBottomBar)
            assertFalse(route, chrome.showRail)
            assertFalse(route, chrome.insetTop)
            assertFalse(route, chrome.insetStart)
            assertFalse(route, chrome.insetEnd)
            assertFalse(route, chrome.insetBottom)
        }
    }

    @Test
    fun `null route is a padded host without chrome`() {
        assertFalse(isMainDestination(null))
        assertFalse(isImmersiveDestination(null))
        assertEquals(
            NavigationChrome(
                showBottomBar = false,
                showRail = false,
                immersive = false,
                insetTop = true,
                insetStart = true,
                insetEnd = true,
                insetBottom = true,
            ),
            navigationChrome(null, PHONE_WIDTH_DP),
        )
    }

    @Test
    fun `login uses detail insets`() {
        val chrome = navigationChrome("login", PHONE_WIDTH_DP)
        assertEquals(
            NavigationChrome(
                showBottomBar = false,
                showRail = false,
                immersive = false,
                insetTop = true,
                insetStart = true,
                insetEnd = true,
                insetBottom = true,
            ),
            chrome,
        )
    }

    companion object {
        private const val PHONE_WIDTH_DP = 411f
        private const val TABLET_WIDTH_DP = 800f
    }
}
