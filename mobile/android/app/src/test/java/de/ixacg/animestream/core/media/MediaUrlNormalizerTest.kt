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
    fun `recovers the direct image address behind a proxied one`() {
        assertEquals(
            "https://images.example/file/1787838438761_1111765.jpg?width=900",
            direct("https://site.example/cdn-img/file/1787838438761_1111765.jpg?width=900"),
        )
        // Round trip: whatever rewriteCdnUrl produced maps back to the address it came from.
        val original = "https://images.example/file/manga%201.jpg"
        val proxied = MediaUrlNormalizer.rewriteCdnUrl(original, siteOrigin = SITE, proxiedHost = IMAGE_HOST)
        assertEquals("https://site.example/cdn-img/file/manga%201.jpg", proxied)
        assertEquals(original, direct(proxied))
    }

    @Test
    fun `only proxied addresses on the site origin have a direct fallback`() {
        assertNull("already direct", direct("https://images.example/file/a.jpg"))
        assertNull("site route that is not the proxy", direct("https://site.example/api/mangas/1"))
        assertNull("proxy path on another origin", direct("https://other.example/cdn-img/file/a.jpg"))
        assertNull("proxy path without a file", direct("https://site.example/cdn-img"))
        assertNull("no configured host", direct("https://site.example/cdn-img/file/a.jpg", proxiedHost = ""))
        assertNull("not a URL", direct("javascript:alert(1)"))
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

    private fun direct(
        proxied: String,
        proxiedHost: String = IMAGE_HOST,
    ): String? = MediaUrlNormalizer.directImageUrl(proxied, siteOrigin = SITE, proxiedHost = proxiedHost)

    private companion object {
        const val SITE = "https://site.example"
        const val IMAGE_HOST = "images.example"
    }
}
