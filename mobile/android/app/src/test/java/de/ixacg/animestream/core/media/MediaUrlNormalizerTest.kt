package de.ixacg.animestream.core.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaUrlNormalizerTest {
    @Test
    fun `validates and canonicalizes configured API origins`() {
        assertEquals("https://example.com", MediaUrlNormalizer.validatedOrigin(" https://example.com/api?q=1#fragment "))
        assertNull(MediaUrlNormalizer.validatedOrigin("ftp://example.com"))
        assertNull(MediaUrlNormalizer.validatedOrigin("not a URL"))
        assertNull(MediaUrlNormalizer.validatedOrigin(null))
    }

    @Test
    fun `build injected origin is already a canonical https origin`() {
        assertEquals(MediaUrlNormalizer.origin, MediaUrlNormalizer.validatedOrigin(MediaUrlNormalizer.origin))
        assertTrue(MediaUrlNormalizer.origin.startsWith("http"))
    }

    @Test
    fun `keeps images and videos on the host they name, including hosts under the site's domain`() {
        val siteDomain = MediaUrlNormalizer.origin.substringAfter("://").substringBefore(':').substringAfter('.')
        val stored =
            listOf(
                "https://image.$siteDomain/file/1787838438761_1111765.jpg?width=900",
                "https://static.$siteDomain/2025/01/a%20b/a%20b.mp4",
                "${MediaUrlNormalizer.origin}/ads/banner.jpg",
                "https://static.other.example/cover.jpg",
            )
        for (url in stored) {
            assertEquals(url, MediaUrlNormalizer.normalize(url))
            assertEquals(url, MediaUrlNormalizer.normalize("  $url  "))
        }
        for (raw in listOf(null, "", "   ", "not a url", "ftp://image.example/a.jpg")) {
            assertNull(MediaUrlNormalizer.normalize(raw))
        }
    }

    @Test
    fun `filters empty and invalid media entries`() {
        assertEquals(
            listOf("https://static.other.example/one.jpg", "https://static.other.example/two.jpg"),
            MediaUrlNormalizer.split(
                "https://static.other.example/one.jpg, invalid value, https://static.other.example/two.jpg",
            ),
        )
        assertNull(MediaUrlNormalizer.normalize("javascript:alert(1)"))
    }
}
