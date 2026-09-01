package de.ixacg.animestream.ui.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepLinkPolicyTest {
    @Test
    fun `forwards only app view deep links`() {
        assertTrue(
            shouldForwardAppDeepLink(
                action = "android.intent.action.VIEW",
                data = "animestream://reader/18/3?page=7",
            ),
        )
        assertTrue(
            shouldForwardAppDeepLink(
                action = "android.intent.action.VIEW",
                data = "ANIMESTREAM://manga-detail/18",
            ),
        )
        assertFalse(
            shouldForwardAppDeepLink(
                action = "android.intent.action.MAIN",
                data = "animestream://reader/18/3?page=7",
            ),
        )
        assertFalse(
            shouldForwardAppDeepLink(
                action = "android.intent.action.VIEW",
                data = "https://www.ixacg.de/manga/18",
            ),
        )
        assertFalse(shouldForwardAppDeepLink(action = "android.intent.action.VIEW", data = null))
    }
}
