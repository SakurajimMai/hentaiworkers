package de.ixacg.animestream.core.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaUrlNormalizerTest {
    @Test
    fun `validates and canonicalizes configured API origins`() {
        assertEquals("https://example.com", MediaUrlNormalizer.validatedOrigin(" https://example.com/api?q=1#fragment "))
        assertEquals(MediaUrlNormalizer.DEFAULT_ORIGIN, MediaUrlNormalizer.validatedOrigin("ftp://example.com"))
        assertEquals(MediaUrlNormalizer.DEFAULT_ORIGIN, MediaUrlNormalizer.validatedOrigin("not a URL"))
        assertEquals(MediaUrlNormalizer.DEFAULT_ORIGIN, MediaUrlNormalizer.validatedOrigin(null))
    }

    @Test
    fun `proxies configured image host through site origin`() {
        assertEquals(
            "https://www.ixacg.de/cdn-img/file/1787838438761_1111765.jpg?width=900",
            MediaUrlNormalizer.rewriteCdnUrl(
                "https://image.ixacg.de/file/1787838438761_1111765.jpg?width=900",
                "https://www.ixacg.de"
            )
        )
    }

    @Test
    fun `leaves other image hosts unchanged`() {
        assertEquals(
            "https://static.hxsl.org/cover.jpg",
            MediaUrlNormalizer.rewriteCdnUrl(
                "https://static.hxsl.org/cover.jpg",
                "https://www.ixacg.de"
            )
        )
    }

    @Test
    fun `filters empty and invalid media entries`() {
        assertEquals(
            listOf("https://static.hxsl.org/one.jpg", "https://static.hxsl.org/two.jpg"),
            MediaUrlNormalizer.split(
                "https://static.hxsl.org/one.jpg, invalid value, https://static.hxsl.org/two.jpg"
            )
        )
        assertNull(MediaUrlNormalizer.normalize("javascript:alert(1)"))
    }
}
