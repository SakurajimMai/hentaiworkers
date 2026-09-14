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
    fun `proxies the configured image host through the site origin`() {
        assertEquals(
            "https://site.example/cdn-img/file/1787838438761_1111765.jpg?width=900",
            MediaUrlNormalizer.rewriteCdnUrl(
                "https://IMAGES.example/file/1787838438761_1111765.jpg?width=900",
                siteOrigin = "https://site.example",
                proxiedHost = "images.example",
            ),
        )
    }

    @Test
    fun `leaves other image hosts unchanged and never rewrites without a configured host`() {
        assertEquals(
            "https://static.other.example/cover.jpg",
            MediaUrlNormalizer.rewriteCdnUrl(
                "https://static.other.example/cover.jpg",
                siteOrigin = "https://site.example",
                proxiedHost = "images.example",
            ),
        )
        assertEquals(
            "https://images.example/cover.jpg",
            MediaUrlNormalizer.rewriteCdnUrl(
                "https://images.example/cover.jpg",
                siteOrigin = "https://site.example",
                proxiedHost = "",
            ),
        )
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
