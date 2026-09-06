package de.ixacg.animestream.ui.components

import de.ixacg.animestream.core.model.PublicAdsConfig
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HtmlAdPolicyTest {
    @Test
    fun bannerDimensionsPreserveCommonSizesAndClampUntrustedValues() {
        assertEquals(HtmlAdPolicy.Dimensions(728, 90), HtmlAdPolicy.dimensions(728, 90))
        assertEquals(HtmlAdPolicy.Dimensions(1920, 600), HtmlAdPolicy.dimensions(9000, 9000))
        assertEquals(HtmlAdPolicy.Dimensions(), HtmlAdPolicy.dimensions(728, 0))
        assertEquals(HtmlAdPolicy.Dimensions(), HtmlAdPolicy.dimensions(-1, 90))
        assertEquals(600f, HtmlAdPolicy.measuredHeight(9000.0))
        assertNull(HtmlAdPolicy.measuredHeight(Double.NaN))
        assertNull(HtmlAdPolicy.measuredHeight(Double.POSITIVE_INFINITY))
        assertNull(HtmlAdPolicy.measuredHeight(-1.0))
    }

    @Test
    fun adJsonAcceptsBothOldAndSizedPublicContracts() {
        val json = Json { ignoreUnknownKeys = true }
        val old = json.decodeFromString<PublicAdsConfig>("""{"reader":{"top":{"enabled":true,"html":"<div>ad</div>"}}}""")
        assertEquals(0, old.reader.top.width)
        assertEquals(0, old.reader.top.height)
        val sized =
            json.decodeFromString<PublicAdsConfig>(
                """{"feedSlots":[{"enabled":true,"width":300,"height":250}],"reader":{"top":{"width":728,"height":90}}}""",
            )
        assertEquals(300, sized.feedSlots.single().width)
        assertEquals(250, sized.feedSlots.single().height)
        assertEquals(728, sized.reader.top.width)
        assertEquals(90, sized.reader.top.height)
    }
}
