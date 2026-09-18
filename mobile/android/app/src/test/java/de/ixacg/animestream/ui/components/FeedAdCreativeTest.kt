package de.ixacg.animestream.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FeedAdCreativeTest {
    @Test
    fun `a pasted image tag is rendered by the app instead of a browser`() {
        assertEquals(
            "https://images.example/ad.png",
            FeedAdCreative.imageUrl(" <img src=\"https://images.example/ad.png\">\n"),
        )
        assertEquals(
            "http://images.example/ad.jpg?a=1&b=2",
            FeedAdCreative.imageUrl(
                """<a href="https://advertiser.example"><img src='http://images.example/ad.jpg?a=1&amp;b=2' /></a>""",
            ),
        )
        assertEquals(
            "https://images.example/ad.png",
            FeedAdCreative.imageUrl("""<div><img width="300" height="250" src=https://images.example/ad.png></div>"""),
        )
    }

    @Test
    fun `creatives that run code or carry layout stay in the WebView`() {
        assertNull(FeedAdCreative.imageUrl(""))
        assertNull(FeedAdCreative.imageUrl("   "))
        assertNull(FeedAdCreative.imageUrl("""<script src="https://ads.example/invoke.js"></script>"""))
        assertNull(FeedAdCreative.imageUrl("""<img src="https://images.example/a.png"><script>track()</script>"""))
        assertNull(FeedAdCreative.imageUrl("""<iframe src="https://ads.example/unit"></iframe>"""))
        assertNull(
            FeedAdCreative.imageUrl(
                """<img src="https://images.example/a.png"><img src="https://images.example/pixel.gif">""",
            ),
        )
        assertNull(FeedAdCreative.imageUrl("""<img src="https://images.example/a.png">立即购买"""))
        assertNull(FeedAdCreative.imageUrl("""<img src="/relative/ad.png">"""))
        assertNull(FeedAdCreative.imageUrl("""<img src="javascript:alert(1)">"""))
        assertNull(FeedAdCreative.imageUrl("""<img alt="no source">"""))
    }
}
