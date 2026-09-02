package de.ixacg.animestream.ui.library

import de.ixacg.animestream.core.media.MediaUrlNormalizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegistrationLaunchPolicyTest {
    @Test
    fun `registration url uses only the validated origin and exact register path`() {
        assertEquals(
            "https://example.com/register",
            RegistrationLaunchPolicy.registrationUrl(" https://example.com/api?q=1#fragment "),
        )
        assertEquals(
            "${MediaUrlNormalizer.DEFAULT_ORIGIN}/register",
            RegistrationLaunchPolicy.registrationUrl("javascript:alert(1)"),
        )
    }

    @Test
    fun `launch passes the validated registration url to the external opener`() {
        var openedUrl: String? = null

        val launched =
            RegistrationLaunchPolicy.launch("https://accounts.example.com/somewhere") { url ->
                openedUrl = url
                true
            }

        assertTrue(launched)
        assertEquals("https://accounts.example.com/register", openedUrl)
    }

    @Test
    fun `launch reports rejected and throwing browser handoffs`() {
        assertFalse(RegistrationLaunchPolicy.launch("https://example.com") { false })
        assertFalse(
            RegistrationLaunchPolicy.launch("https://example.com") {
                throw IllegalStateException("No browser")
            },
        )
    }
}
