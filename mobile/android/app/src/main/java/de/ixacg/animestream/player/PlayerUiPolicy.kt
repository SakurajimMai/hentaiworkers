package de.ixacg.animestream.player

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Deterministic behaviour of the player chrome: seeking, gesture routing, chrome auto-hide and
 * progress persistence. Kept free of Compose and Media3 types so CI can unit test it without a
 * device, which is the only place Android code is built.
 */
object PlayerUiPolicy {
    /** How the video surface fills the screen. Mapped to Media3 resize modes by the UI layer. */
    enum class VideoFit {
        Fit,
        Fill,
        Crop,
    }

    /** Horizontal thirds used by double-tap. The middle third toggles play instead of seeking. */
    enum class TapZone {
        Rewind,
        Toggle,
        Forward,
    }

    /** What a drag gesture controls, decided once from its first movement. */
    enum class DragAxis {
        Seek,
        Brightness,
        Volume,
    }

    const val SEEK_STEP_MS = 10_000L
    const val CONTROLS_AUTO_HIDE_MS = 3_500L
    const val BOOST_SPEED = 2f

    /** Cloud progress is written at most this often while playing, plus once on pause or exit. */
    const val PROGRESS_SAVE_INTERVAL_MS = 15_000L

    /** A full-width horizontal drag covers at most this much video, so long titles stay precise. */
    private const val MAX_SCRUB_WINDOW_MS = 300_000L
    private const val COMPLETION_FRACTION = 0.95
    private const val MIN_RESUME_MS = 5_000L
    private val SPEEDS = listOf(1f, 1.25f, 1.5f, 2f)

    /** Clamp to the media window. A non-positive duration means "not known yet", so only clamp below. */
    fun boundedPosition(
        positionMs: Long,
        durationMs: Long,
    ): Long {
        if (positionMs <= 0L) return 0L
        if (durationMs <= 0L) return positionMs
        return minOf(positionMs, durationMs)
    }

    fun seekBy(
        currentMs: Long,
        deltaMs: Long,
        durationMs: Long,
    ): Long = boundedPosition(currentMs + deltaMs, durationMs)

    /** `mm:ss` below an hour, `h:mm:ss` above it. Locale-independent digits. */
    fun formatTime(positionMs: Long): String {
        val totalSeconds = (if (positionMs > 0L) positionMs else 0L) / 1_000L
        val seconds = totalSeconds % 60
        val minutes = (totalSeconds / 60) % 60
        val hours = totalSeconds / 3_600
        return if (hours > 0) {
            String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.ROOT, "%02d:%02d", minutes, seconds)
        }
    }

    fun progressFraction(
        positionMs: Long,
        durationMs: Long,
    ): Float {
        if (durationMs <= 0L || positionMs <= 0L) return 0f
        return (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
    }

    fun positionForFraction(
        fraction: Float,
        durationMs: Long,
    ): Long {
        if (durationMs <= 0L || !fraction.isFinite()) return 0L
        return boundedPosition((fraction.coerceIn(0f, 1f) * durationMs).roundToLong(), durationMs)
    }

    fun tapZone(
        x: Float,
        width: Float,
    ): TapZone {
        if (width <= 0f || !x.isFinite()) return TapZone.Toggle
        val third = width / 3f
        return when {
            x < third -> TapZone.Rewind
            x > width - third -> TapZone.Forward
            else -> TapZone.Toggle
        }
    }

    /**
     * Horizontal movement scrubs; vertical movement controls brightness on the left half and volume
     * on the right half, matching what viewers expect from other Android players.
     */
    fun dragAxis(
        startX: Float,
        width: Float,
        dx: Float,
        dy: Float,
    ): DragAxis {
        if (abs(dx) >= abs(dy)) return DragAxis.Seek
        return if (width > 0f && startX < width / 2f) DragAxis.Brightness else DragAxis.Volume
    }

    fun scrubPosition(
        startMs: Long,
        dragPx: Float,
        viewportPx: Float,
        durationMs: Long,
    ): Long {
        if (viewportPx <= 0f || !dragPx.isFinite()) return boundedPosition(startMs, durationMs)
        val window = if (durationMs <= 0L) MAX_SCRUB_WINDOW_MS else minOf(durationMs, MAX_SCRUB_WINDOW_MS)
        val delta = (dragPx / viewportPx) * window.toFloat()
        return boundedPosition(startMs + delta.roundToLong(), durationMs)
    }

    /** Dragging up raises the level; the returned value is always a valid 0..1 level. */
    fun adjustLevel(
        current: Float,
        dragPx: Float,
        viewportPx: Float,
    ): Float {
        if (viewportPx <= 0f || !dragPx.isFinite() || !current.isFinite()) return current.coerceIn(0f, 1f)
        return (current - dragPx / viewportPx).coerceIn(0f, 1f)
    }

    fun nextSpeed(current: Float): Float {
        val index = SPEEDS.indexOfFirst { abs(it - current) < 0.01f }
        return if (index < 0) SPEEDS.first() else SPEEDS[(index + 1) % SPEEDS.size]
    }

    fun speedLabel(speed: Float): String {
        val rounded = (speed * 100).roundToLong() / 100.0
        val text =
            if (rounded % 1.0 == 0.0) {
                rounded.toLong().toString()
            } else {
                String.format(Locale.ROOT, "%.2f", rounded).trimEnd('0').trimEnd('.')
            }
        return "${text}x"
    }

    fun nextFit(current: VideoFit): VideoFit =
        when (current) {
            VideoFit.Fit -> VideoFit.Fill
            VideoFit.Fill -> VideoFit.Crop
            VideoFit.Crop -> VideoFit.Fit
        }

    fun fitLabel(fit: VideoFit): String =
        when (fit) {
            VideoFit.Fit -> "适应"
            VideoFit.Fill -> "填充"
            VideoFit.Crop -> "裁切"
        }

    /** Chrome only hides itself while playback is actually running and the viewer is not interacting. */
    fun shouldAutoHideControls(
        isPlaying: Boolean,
        locked: Boolean,
        scrubbing: Boolean,
    ): Boolean = isPlaying && !locked && !scrubbing

    /** Throttle periodic writes; pause and exit persist unconditionally through their own paths. */
    fun shouldPersistProgress(
        positionMs: Long,
        lastSavedMs: Long,
    ): Boolean {
        if (positionMs < 0L) return false
        return abs(positionMs - lastSavedMs) >= PROGRESS_SAVE_INTERVAL_MS
    }

    fun isCompleted(
        positionMs: Long,
        durationMs: Long,
    ): Boolean {
        if (durationMs <= 0L) return false
        return positionMs >= (durationMs * COMPLETION_FRACTION).roundToLong()
    }

    /**
     * Where a reopened title should start. Finished and barely-started titles restart from zero so a
     * stale cloud position cannot drop the viewer at the credits.
     */
    fun resumePositionMs(
        savedSeconds: Long,
        durationSeconds: Long,
    ): Long {
        val savedMs = savedSeconds * 1_000L
        val durationMs = durationSeconds * 1_000L
        if (savedMs < MIN_RESUME_MS) return 0L
        if (durationMs > 0L && isCompleted(savedMs, durationMs)) return 0L
        return boundedPosition(savedMs, durationMs)
    }
}
