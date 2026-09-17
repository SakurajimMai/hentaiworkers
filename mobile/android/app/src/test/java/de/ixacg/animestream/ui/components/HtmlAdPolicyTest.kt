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
    fun fitScaleLetterboxesCardsAndFillsBannersWithoutCropping() {
        val banner = HtmlAdPolicy.Dimensions(300, 250)
        // Poster cell 170x255: width-limited, may not exceed the cell height.
        assertEquals(170f / 300f, HtmlAdPolicy.fitScale(170f, 255f, banner, allowUpscale = true), 0.0001f)
        // Skyscraper 300x600 in the same cell is height-limited.
        assertEquals(255f / 600f, HtmlAdPolicy.fitScale(170f, 255f, HtmlAdPolicy.Dimensions(300, 600), allowUpscale = true), 0.0001f)
        // Two-column banner grows to fill the span; the default reader path never upscales.
        assertEquals(340f / 300f, HtmlAdPolicy.fitScale(340f, null, banner, allowUpscale = true), 0.0001f)
        assertEquals(1f, HtmlAdPolicy.fitScale(340f, null, banner, allowUpscale = false), 0f)
        assertEquals(0.5f, HtmlAdPolicy.fitScale(150f, null, banner, allowUpscale = false), 0.0001f)
        // Degenerate inputs fall back to the native size.
        assertEquals(1f, HtmlAdPolicy.fitScale(0f, 100f, banner, allowUpscale = true), 0f)
        assertEquals(1f, HtmlAdPolicy.fitScale(170f, 255f, HtmlAdPolicy.Dimensions(), allowUpscale = true), 0f)
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
        val legacy =
            json.decodeFromString<PublicAdsConfig>("""{"feedSlots":[{"enabled":true,"placement":"banner"}]}""")
        assertEquals(true, legacy.feedSlots.single().enabled)
    }
}
