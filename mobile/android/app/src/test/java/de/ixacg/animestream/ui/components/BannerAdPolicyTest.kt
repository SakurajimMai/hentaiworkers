package de.ixacg.animestream.ui.components

import de.ixacg.animestream.core.model.BannerAd
import de.ixacg.animestream.core.model.PublicAdsConfig
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BannerAdPolicyTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun selectChoosesVariantByWidthAndFallsBackToOtherVariant() {
        val both =
            BannerAd(
                desktopHtml = "<div>desktop</div>",
                desktopWidth = 728,
                desktopHeight = 90,
                mobileHtml = "<div>mobile</div>",
                mobileWidth = 320,
                mobileHeight = 50,
            )
        assertEquals(
            BannerAdPolicy.Creative("<div>mobile</div>", 320, 50),
            BannerAdPolicy.select(both, 400),
        )
        assertEquals(
            BannerAdPolicy.Creative("<div>desktop</div>", 728, 90),
            BannerAdPolicy.select(both, 800),
        )
        assertTrue(BannerAdPolicy.hasCreative(both))

        val desktopOnly =
            BannerAd(
                desktopHtml = "<div>desktop</div>",
                desktopWidth = 728,
                desktopHeight = 90,
            )
        assertEquals(
            BannerAdPolicy.Creative("<div>desktop</div>", 728, 90),
            BannerAdPolicy.select(desktopOnly, 400),
        )
        assertTrue(BannerAdPolicy.hasCreative(desktopOnly))

        val mobileOnly =
            BannerAd(
                mobileHtml = "<div>mobile</div>",
                mobileWidth = 320,
                mobileHeight = 50,
            )
        assertEquals(
            BannerAdPolicy.Creative("<div>mobile</div>", 320, 50),
            BannerAdPolicy.select(mobileOnly, 800),
        )
        assertTrue(BannerAdPolicy.hasCreative(mobileOnly))

        val empty = BannerAd()
        assertNull(BannerAdPolicy.select(empty, 400))
        assertNull(BannerAdPolicy.select(empty, 800))
        assertFalse(BannerAdPolicy.hasCreative(empty))
    }

    @Test
    fun publicAdsConfigParsesNewBannerAndSmartlinkFieldsAndOldPayloadsDefaultCleanly() {
        val modern =
            json.decodeFromString(
                PublicAdsConfig.serializer(),
                """
                {
                  "feedSlots": [],
                  "banners": {
                    "home": {
                      "desktopHtml": "<script>d</script>",
                      "desktopWidth": 728,
                      "desktopHeight": 90,
                      "mobileHtml": "<script>m</script>",
                      "mobileWidth": 320,
                      "mobileHeight": 50
                    },
                    "watch": { "desktopHtml": "", "desktopWidth": 0, "desktopHeight": 0, "mobileHtml": "", "mobileWidth": 0, "mobileHeight": 0 },
                    "manga": { "desktopHtml": "", "desktopWidth": 0, "desktopHeight": 0, "mobileHtml": "", "mobileWidth": 0, "mobileHeight": 0 }
                  },
                  "smartlinkUrl": "https://smart.example/fallback"
                }
                """.trimIndent(),
            )
        assertEquals("<script>d</script>", modern.banners.home.desktopHtml)
        assertEquals(728, modern.banners.home.desktopWidth)
        assertEquals(90, modern.banners.home.desktopHeight)
        assertEquals("<script>m</script>", modern.banners.home.mobileHtml)
        assertEquals(320, modern.banners.home.mobileWidth)
        assertEquals(50, modern.banners.home.mobileHeight)
        assertEquals("https://smart.example/fallback", modern.smartlinkUrl)

        val legacy =
            json.decodeFromString(
                PublicAdsConfig.serializer(),
                """
                {
                  "feedSlots": []
                }
                """.trimIndent(),
            )
        assertEquals(BannerAd(), legacy.banners.home)
        assertEquals("", legacy.smartlinkUrl)
    }
}
