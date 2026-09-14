package de.ixacg.animestream.player

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val BOOST_HOLD_MS = 600L

/**
 * Recognises the player's touch vocabulary and reports it as intent. Deliberately knows nothing
 * about Media3 or the chrome, so the screen keeps every playback decision in one place.
 *
 * A press that turns into a drag must not also start the hold-to-boost gesture, so the boost is
 * armed on a timer and released by either the drag starting or the finger lifting.
 */
@Composable
internal fun PlayerGestureLayer(
    enabled: Boolean,
    locked: Boolean,
    widthPx: Float,
    heightPx: Float,
    onToggleControls: () -> Unit,
    onZoneTap: (PlayerUiPolicy.TapZone) -> Unit,
    onBoostChange: (Boolean) -> Unit,
    onScrubStart: () -> Unit,
    onScrubDelta: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    onLevelDelta: (PlayerUiPolicy.DragAxis, Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val lockedState by rememberUpdatedState(locked)
    val toggleControls by rememberUpdatedState(onToggleControls)
    val zoneTap by rememberUpdatedState(onZoneTap)
    val boostChange by rememberUpdatedState(onBoostChange)
    val scrubStart by rememberUpdatedState(onScrubStart)
    val scrubDelta by rememberUpdatedState(onScrubDelta)
    val scrubEnd by rememberUpdatedState(onScrubEnd)
    val levelDelta by rememberUpdatedState(onLevelDelta)

    Box(
        modifier =
            modifier
                .fillMaxSize()
                .pointerInput(enabled, widthPx) {
                    if (!enabled) return@pointerInput
                    var boosted = false
                    var dragging = false
                    detectTapGestures(
                        onTap = { toggleControls() },
                        onDoubleTap = { offset ->
                            if (!lockedState) zoneTap(PlayerUiPolicy.tapZone(offset.x, widthPx))
                        },
                        onPress = {
                            dragging = false
                            boosted = false
                            val armed =
                                scope.launch {
                                    delay(BOOST_HOLD_MS)
                                    if (!lockedState && !dragging) {
                                        boosted = true
                                        boostChange(true)
                                    }
                                }
                            tryAwaitRelease()
                            armed.cancel()
                            dragging = true
                            if (boosted) {
                                boosted = false
                                boostChange(false)
                            }
                        },
                    )
                }
                .pointerInput(enabled, locked, widthPx, heightPx) {
                    if (!enabled || locked) return@pointerInput
                    var axis = PlayerUiPolicy.DragAxis.Seek
                    var startX = 0f
                    var accumulatedX = 0f
                    var decided = false
                    detectDragGestures(
                        onDragStart = { offset ->
                            boostChange(false)
                            startX = offset.x
                            accumulatedX = 0f
                            decided = false
                            axis = PlayerUiPolicy.DragAxis.Seek
                        },
                        onDragEnd = { if (axis == PlayerUiPolicy.DragAxis.Seek) scrubEnd() },
                        onDragCancel = { if (axis == PlayerUiPolicy.DragAxis.Seek) scrubEnd() },
                        onDrag = { change, amount ->
                            change.consume()
                            if (!decided) {
                                axis = PlayerUiPolicy.dragAxis(startX, widthPx, amount.x, amount.y)
                                decided = true
                                if (axis == PlayerUiPolicy.DragAxis.Seek) scrubStart()
                            }
                            if (axis == PlayerUiPolicy.DragAxis.Seek) {
                                accumulatedX += amount.x
                                scrubDelta(accumulatedX)
                            } else {
                                levelDelta(axis, amount.y)
                            }
                        },
                    )
                },
    )
}
