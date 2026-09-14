package de.ixacg.animestream.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerUiPolicyTest {
    @Test
    fun `positions stay inside the media window and an unknown duration only clamps below zero`() {
        assertEquals(0L, PlayerUiPolicy.boundedPosition(-5_000L, 60_000L))
        assertEquals(60_000L, PlayerUiPolicy.boundedPosition(90_000L, 60_000L))
        assertEquals(30_000L, PlayerUiPolicy.boundedPosition(30_000L, 60_000L))
        assertEquals(90_000L, PlayerUiPolicy.boundedPosition(90_000L, 0L))
        assertEquals(0L, PlayerUiPolicy.boundedPosition(-1L, 0L))
    }

    @Test
    fun `ten second steps never run past either end of the title`() {
        assertEquals(20_000L, PlayerUiPolicy.seekBy(10_000L, PlayerUiPolicy.SEEK_STEP_MS, 60_000L))
        assertEquals(0L, PlayerUiPolicy.seekBy(4_000L, -PlayerUiPolicy.SEEK_STEP_MS, 60_000L))
        assertEquals(60_000L, PlayerUiPolicy.seekBy(58_000L, PlayerUiPolicy.SEEK_STEP_MS, 60_000L))
    }

    @Test
    fun `time labels drop the hour segment below an hour and stay locale independent`() {
        assertEquals("00:00", PlayerUiPolicy.formatTime(0L))
        assertEquals("00:00", PlayerUiPolicy.formatTime(-4_000L))
        assertEquals("00:09", PlayerUiPolicy.formatTime(9_400L))
        assertEquals("12:05", PlayerUiPolicy.formatTime(725_000L))
        assertEquals("1:00:00", PlayerUiPolicy.formatTime(3_600_000L))
        assertEquals("2:03:04", PlayerUiPolicy.formatTime(7_384_000L))
    }

    @Test
    fun `progress fraction and its inverse agree and tolerate an unknown duration`() {
        assertEquals(0.5f, PlayerUiPolicy.progressFraction(30_000L, 60_000L), 0.0001f)
        assertEquals(1f, PlayerUiPolicy.progressFraction(90_000L, 60_000L), 0.0001f)
        assertEquals(0f, PlayerUiPolicy.progressFraction(30_000L, 0L), 0.0001f)
        assertEquals(30_000L, PlayerUiPolicy.positionForFraction(0.5f, 60_000L))
        assertEquals(60_000L, PlayerUiPolicy.positionForFraction(2f, 60_000L))
        assertEquals(0L, PlayerUiPolicy.positionForFraction(0.5f, 0L))
        assertEquals(0L, PlayerUiPolicy.positionForFraction(Float.NaN, 60_000L))
    }

    @Test
    fun `double tap thirds seek at the edges and toggle in the middle`() {
        assertEquals(PlayerUiPolicy.TapZone.Rewind, PlayerUiPolicy.tapZone(40f, 900f))
        assertEquals(PlayerUiPolicy.TapZone.Toggle, PlayerUiPolicy.tapZone(450f, 900f))
        assertEquals(PlayerUiPolicy.TapZone.Forward, PlayerUiPolicy.tapZone(860f, 900f))
        assertEquals(PlayerUiPolicy.TapZone.Toggle, PlayerUiPolicy.tapZone(10f, 0f))
    }

    @Test
    fun `drags scrub horizontally and split brightness and volume by screen half`() {
        assertEquals(PlayerUiPolicy.DragAxis.Seek, PlayerUiPolicy.dragAxis(100f, 900f, dx = -40f, dy = 5f))
        assertEquals(PlayerUiPolicy.DragAxis.Brightness, PlayerUiPolicy.dragAxis(100f, 900f, dx = 2f, dy = -40f))
        assertEquals(PlayerUiPolicy.DragAxis.Volume, PlayerUiPolicy.dragAxis(800f, 900f, dx = 2f, dy = 40f))
    }

    @Test
    fun `scrubbing maps a full width drag to a bounded window rather than the whole title`() {
        val tenMinutes = 600_000L
        val forward = PlayerUiPolicy.scrubPosition(startMs = 0L, dragPx = 900f, viewportPx = 900f, durationMs = tenMinutes)
        assertEquals(300_000L, forward)

        val shortTitle = 60_000L
        assertEquals(30_000L, PlayerUiPolicy.scrubPosition(0L, 450f, 900f, shortTitle))
        assertEquals(0L, PlayerUiPolicy.scrubPosition(10_000L, -900f, 900f, shortTitle))
        assertEquals(10_000L, PlayerUiPolicy.scrubPosition(10_000L, 40f, 0f, shortTitle))
    }

    @Test
    fun `level drags move up to raise and always return a usable level`() {
        assertEquals(0.7f, PlayerUiPolicy.adjustLevel(0.5f, dragPx = -200f, viewportPx = 1_000f), 0.0001f)
        assertEquals(0.3f, PlayerUiPolicy.adjustLevel(0.5f, dragPx = 200f, viewportPx = 1_000f), 0.0001f)
        assertEquals(1f, PlayerUiPolicy.adjustLevel(0.9f, dragPx = -900f, viewportPx = 1_000f), 0.0001f)
        assertEquals(0f, PlayerUiPolicy.adjustLevel(0.1f, dragPx = 900f, viewportPx = 1_000f), 0.0001f)
        assertEquals(0.5f, PlayerUiPolicy.adjustLevel(0.5f, dragPx = 100f, viewportPx = 0f), 0.0001f)
    }

    @Test
    fun `speed cycles through the documented steps and renders compact labels`() {
        assertEquals(1.25f, PlayerUiPolicy.nextSpeed(1f), 0.0001f)
        assertEquals(1.5f, PlayerUiPolicy.nextSpeed(1.25f), 0.0001f)
        assertEquals(2f, PlayerUiPolicy.nextSpeed(1.5f), 0.0001f)
        assertEquals(1f, PlayerUiPolicy.nextSpeed(2f), 0.0001f)
        assertEquals(1f, PlayerUiPolicy.nextSpeed(3.7f), 0.0001f)
        assertEquals("1x", PlayerUiPolicy.speedLabel(1f))
        assertEquals("1.25x", PlayerUiPolicy.speedLabel(1.25f))
        assertEquals("1.5x", PlayerUiPolicy.speedLabel(1.5f))
        assertEquals("2x", PlayerUiPolicy.speedLabel(PlayerUiPolicy.BOOST_SPEED))
    }

    @Test
    fun `video fit cycles fit fill crop and is labelled for the chrome`() {
        assertEquals(PlayerUiPolicy.VideoFit.Fill, PlayerUiPolicy.nextFit(PlayerUiPolicy.VideoFit.Fit))
        assertEquals(PlayerUiPolicy.VideoFit.Crop, PlayerUiPolicy.nextFit(PlayerUiPolicy.VideoFit.Fill))
        assertEquals(PlayerUiPolicy.VideoFit.Fit, PlayerUiPolicy.nextFit(PlayerUiPolicy.VideoFit.Crop))
        assertEquals("适应", PlayerUiPolicy.fitLabel(PlayerUiPolicy.VideoFit.Fit))
        assertEquals("填充", PlayerUiPolicy.fitLabel(PlayerUiPolicy.VideoFit.Fill))
        assertEquals("裁切", PlayerUiPolicy.fitLabel(PlayerUiPolicy.VideoFit.Crop))
    }

    @Test
    fun `chrome only auto hides during uninterrupted playback`() {
        assertTrue(PlayerUiPolicy.shouldAutoHideControls(isPlaying = true, locked = false, scrubbing = false))
        assertFalse(PlayerUiPolicy.shouldAutoHideControls(isPlaying = false, locked = false, scrubbing = false))
        assertFalse(PlayerUiPolicy.shouldAutoHideControls(isPlaying = true, locked = true, scrubbing = false))
        assertFalse(PlayerUiPolicy.shouldAutoHideControls(isPlaying = true, locked = false, scrubbing = true))
    }

    @Test
    fun `cloud progress is throttled in both directions and ignores invalid positions`() {
        assertFalse(PlayerUiPolicy.shouldPersistProgress(positionMs = 5_000L, lastSavedMs = 0L))
        assertTrue(
            PlayerUiPolicy.shouldPersistProgress(
                positionMs = PlayerUiPolicy.PROGRESS_SAVE_INTERVAL_MS,
                lastSavedMs = 0L,
            ),
        )
        assertTrue(PlayerUiPolicy.shouldPersistProgress(positionMs = 0L, lastSavedMs = 600_000L))
        assertFalse(PlayerUiPolicy.shouldPersistProgress(positionMs = -1L, lastSavedMs = 600_000L))
    }

    @Test
    fun `completion needs a known duration and the last few percent of the title`() {
        assertFalse(PlayerUiPolicy.isCompleted(59_000L, 0L))
        assertFalse(PlayerUiPolicy.isCompleted(50_000L, 60_000L))
        assertTrue(PlayerUiPolicy.isCompleted(57_000L, 60_000L))
        assertTrue(PlayerUiPolicy.isCompleted(60_000L, 60_000L))
    }

    @Test
    fun `resume skips barely started and already finished titles`() {
        assertEquals(0L, PlayerUiPolicy.resumePositionMs(savedSeconds = 2L, durationSeconds = 1_400L))
        assertEquals(0L, PlayerUiPolicy.resumePositionMs(savedSeconds = 1_390L, durationSeconds = 1_400L))
        assertEquals(600_000L, PlayerUiPolicy.resumePositionMs(savedSeconds = 600L, durationSeconds = 1_400L))
        assertEquals(600_000L, PlayerUiPolicy.resumePositionMs(savedSeconds = 600L, durationSeconds = 0L))
    }
}
