package de.ixacg.animestream.player

import de.ixacg.animestream.core.model.PlayerPreRollAd
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerAdPolicyTest {
    @Test
    fun `waits for late ads before deciding whether main playback can start`() {
        val ad = PlayerPreRollAd(enabled = true, imageUrl = "https://example.com/ad.jpg")

        assertEquals(
            PlayerAdPolicy.PreRollDecision.Waiting,
            PlayerAdPolicy.preRollDecision(adsReady = false, ad),
        )
        assertEquals(
            PlayerAdPolicy.PreRollDecision.Show,
            PlayerAdPolicy.preRollDecision(adsReady = true, ad),
        )
        assertEquals(
            PlayerAdPolicy.PreRollDecision.Skip,
            PlayerAdPolicy.preRollDecision(adsReady = true, PlayerPreRollAd()),
        )
    }

    @Test
    fun `pre roll close delay is clamped to total duration`() {
        assertFalse(PlayerAdPolicy.canDismissPreRoll(4, 5, 10))
        assertTrue(PlayerAdPolicy.canDismissPreRoll(5, 5, 10))
        assertTrue(PlayerAdPolicy.canDismissPreRoll(3, 99, 3))
    }

    @Test
    fun `pre roll content and timing match legacy bounds`() {
        assertFalse(PlayerAdPolicy.hasContent(" ", "", ""))
        assertTrue(PlayerAdPolicy.hasContent("", "", "<p>ad</p>"))
        assertEquals(
            PlayerAdPolicy.PreRollTiming(closeDelaySeconds = 120, totalDurationSeconds = 120),
            PlayerAdPolicy.normalizePreRollTiming(closeDelaySeconds = 999, totalDurationSeconds = 2),
        )
        assertEquals(
            PlayerAdPolicy.PreRollTiming(closeDelaySeconds = 0, totalDurationSeconds = 5),
            PlayerAdPolicy.normalizePreRollTiming(closeDelaySeconds = 0, totalDurationSeconds = 0),
        )
    }

    @Test
    fun `pause ad excludes pre roll buffering and natural end`() {
        assertTrue(PlayerAdPolicy.shouldShowPauseAd(true, false, false, false, false, false))
        assertFalse(PlayerAdPolicy.shouldShowPauseAd(false, false, false, false, false, false))
        assertFalse(PlayerAdPolicy.shouldShowPauseAd(true, true, false, false, false, false))
        assertFalse(PlayerAdPolicy.shouldShowPauseAd(true, false, true, false, false, false))
        assertFalse(PlayerAdPolicy.shouldShowPauseAd(true, false, false, false, true, false))
        assertFalse(PlayerAdPolicy.shouldShowPauseAd(true, false, false, false, false, true))
    }
}
