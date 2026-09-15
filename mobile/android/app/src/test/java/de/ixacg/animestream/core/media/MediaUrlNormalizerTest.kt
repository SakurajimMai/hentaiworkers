package de.ixacg.animestream.core.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertTrue(MediaUrlNormalizer.proxiedImageDomain.isNotEmpty())
    }

    @Test
    fun `proxy scope is the site's parent domain, guarded against two-label public suffixes`() {
        // Same examples as tests/server/image-proxy.test.ts; both sides must agree.
        assertEquals("site.example", MediaUrlNormalizer.imageProxyDomain("https://www.site.example"))
        assertEquals("site.example", MediaUrlNormalizer.imageProxyDomain("https://site.example"))
        assertEquals("site.example", MediaUrlNormalizer.imageProxyDomain("https://app.site.example:8443/"))
        assertEquals("example.co.uk", MediaUrlNormalizer.imageProxyDomain("https://example.co.uk"))
        assertEquals("example.co.uk", MediaUrlNormalizer.imageProxyDomain("https://www.example.co.uk"))
        assertEquals("localhost", MediaUrlNormalizer.imageProxyDomain("http://localhost:3000"))
        assertEquals("", MediaUrlNormalizer.imageProxyDomain("not a url"))
    }

    @Test
    fun `any host under the site's domain is proxied except the site itself`() {
        assertTrue(MediaUrlNormalizer.isProxiedImageHost("image1.site.example", SITE))
        assertTrue(MediaUrlNormalizer.isProxiedImageHost("IMAGE2.site.example", SITE))
        assertTrue(MediaUrlNormalizer.isProxiedImageHost("cdn.eu.site.example", SITE))
        assertTrue(MediaUrlNormalizer.isProxiedImageHost("site.example", SITE))
        assertFalse("the site itself is never proxied", MediaUrlNormalizer.isProxiedImageHost("www.site.example", SITE))
        assertFalse(MediaUrlNormalizer.isProxiedImageHost("site.example.evil", SITE))
        assertFalse(MediaUrlNormalizer.isProxiedImageHost("evilsite.example", SITE))
        assertFalse(MediaUrlNormalizer.isProxiedImageHost("static.other.example", SITE))
        assertFalse(MediaUrlNormalizer.isProxiedImageHost("", SITE))
    }

    @Test
    fun `proxies image hosts under the site's domain through the site origin with the host in the path`() {
        assertEquals(
            "https://www.site.example/cdn-img/images.site.example/file/1787838438761_1111765.jpg?width=900",
            MediaUrlNormalizer.rewriteCdnUrl("https://IMAGES.site.example/file/1787838438761_1111765.jpg?width=900", SITE),
        )
        assertEquals(
            "https://www.site.example/cdn-img/image2.site.example/file/a.jpg",
            MediaUrlNormalizer.rewriteCdnUrl("https://image2.site.example/file/a.jpg", SITE),
        )
        assertEquals(
            "https://www.site.example/cdn-img/image2.site.example:8443/file/a.jpg",
            MediaUrlNormalizer.rewriteCdnUrl("https://image2.site.example:8443/file/a.jpg", SITE),
        )
    }

    @Test
    fun `leaves other hosts and the site itself unchanged`() {
        assertEquals("https://static.other.example/cover.jpg", MediaUrlNormalizer.rewriteCdnUrl("https://static.other.example/cover.jpg", SITE))
        assertEquals("https://www.site.example/api/mangas/1/cover", MediaUrlNormalizer.rewriteCdnUrl("https://www.site.example/api/mangas/1/cover", SITE))
        assertEquals("not a url", MediaUrlNormalizer.rewriteCdnUrl("not a url", SITE))
    }

    @Test
    fun `recovers the direct image address behind a proxied one`() {
        assertEquals(
            "https://images.site.example/file/1787838438761_1111765.jpg?width=900",
            MediaUrlNormalizer.directImageUrl("https://www.site.example/cdn-img/images.site.example/file/1787838438761_1111765.jpg?width=900", SITE),
        )
        assertEquals(
            "https://image2.site.example:8443/file/a.jpg",
            MediaUrlNormalizer.directImageUrl("https://www.site.example/cdn-img/image2.site.example:8443/file/a.jpg", SITE),
        )
        // Round trip: whatever rewriteCdnUrl produced maps back to the address it came from.
        val original = "https://image1.site.example/file/manga%201.jpg"
        val proxied = MediaUrlNormalizer.rewriteCdnUrl(original, SITE)
        assertEquals("https://www.site.example/cdn-img/image1.site.example/file/manga%201.jpg", proxied)
        assertEquals(original, MediaUrlNormalizer.directImageUrl(proxied, SITE))
    }

    @Test
    fun `only proxied addresses on the site origin have a direct fallback`() {
        assertNull("already direct", MediaUrlNormalizer.directImageUrl("https://images.site.example/file/a.jpg", SITE))
        assertNull("site route that is not the proxy", MediaUrlNormalizer.directImageUrl("https://www.site.example/api/mangas/1", SITE))
        assertNull("proxy path on another origin", MediaUrlNormalizer.directImageUrl("https://other.example/cdn-img/images.site.example/file/a.jpg", SITE))
        assertNull("legacy path without a host", MediaUrlNormalizer.directImageUrl("https://www.site.example/cdn-img/file/a.jpg", SITE))
        assertNull("host outside the domain", MediaUrlNormalizer.directImageUrl("https://www.site.example/cdn-img/other.example/file/a.jpg", SITE))
        assertNull("host is the site itself", MediaUrlNormalizer.directImageUrl("https://www.site.example/cdn-img/www.site.example/file/a.jpg", SITE))
        assertNull("not a URL", MediaUrlNormalizer.directImageUrl("javascript:alert(1)", SITE))
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

    private companion object {
        const val SITE = "https://www.site.example"
    }
}
