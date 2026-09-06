package de.ixacg.animestream.reader

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculateCentroidSize
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import kotlin.math.abs
import kotlin.math.roundToInt

@Stable
internal class ReaderCanvasState {
    var scale by mutableFloatStateOf(1f)
    var offsetX by mutableFloatStateOf(0f)
    var hasMultiplePointers by mutableStateOf(false)
    var viewportWidth = 0
    var measuredScale = 1f
    var centroid = Offset.Zero
    var anchor: ReaderZoomAnchor? = null
}

internal data class ReaderZoomAnchor(
    val itemKey: Any,
    val itemFraction: Float,
)

@Composable
internal fun rememberReaderCanvasState(): ReaderCanvasState =
    rememberSaveable(
        saver =
            listSaver(
                save = { state: ReaderCanvasState -> listOf(state.scale, state.offsetX) },
                restore = { values ->
                    ReaderCanvasState().apply {
                        scale = ReaderLogic.readingScale(values[0])
                        offsetX = values[1]
                    }
                },
            ),
    ) { ReaderCanvasState() }

@Composable
internal fun ReaderCanvas(
    state: ReaderCanvasState,
    listState: LazyListState,
    onTransform: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val currentOnTransform by rememberUpdatedState(onTransform)
    fun applyTransform(
        zoom: Float,
        pan: Offset,
        allowVerticalPan: Boolean,
    ) {
        val previousScale = state.scale
        val nextScale = ReaderLogic.readingScale(previousScale * zoom)
        state.offsetX =
            ReaderLogic.readingOffsetX(
                offsetX = state.offsetX,
                centroidX = state.centroid.x,
                panX = pan.x,
                previousScale = previousScale,
                nextScale = nextScale,
                viewportWidth = state.viewportWidth,
            )
        if (nextScale != previousScale) {
            val anchor = state.anchor
            val item = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == anchor?.itemKey }
            if (item != null && anchor != null) {
                listState.requestScrollToItem(
                    index = item.index,
                    scrollOffset =
                        ReaderLogic.zoomAnchorScrollOffset(
                            itemSize = item.size,
                            itemFraction = anchor.itemFraction,
                            scaleChange = nextScale / state.measuredScale,
                            centroidY = state.centroid.y,
                        ),
                )
            }
            state.scale = nextScale
        } else if (allowVerticalPan && pan.y != 0f) {
            listState.requestScrollToItem(
                listState.firstVisibleItemIndex,
                listState.firstVisibleItemScrollOffset - pan.y.roundToInt(),
            )
        }
        currentOnTransform()
    }
    Box(
        modifier =
            modifier.clipToBounds()
                .onSizeChanged { size ->
                    state.viewportWidth = size.width
                    state.offsetX = ReaderLogic.boundedReadingOffsetX(state.offsetX, state.scale, size.width)
                }
                .pointerInput(state, listState) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        var accumulatedZoom = 1f
                        var accumulatedPan = Offset.Zero
                        var horizontalPan = false
                        var verticalPan = false
                        var pinch = false
                        try {
                            do {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val pressed = event.changes.count { it.pressed }
                                if (pressed == 0) break
                                val multiple = pressed > 1
                                val zoom = if (multiple) event.calculateZoom() else 1f
                                val pan = event.calculatePan()
                                accumulatedZoom *= zoom
                                accumulatedPan += pan
                                val zoomMotion = abs(1f - accumulatedZoom) * event.calculateCentroidSize(useCurrent = false)
                                if (
                                    multiple &&
                                    (zoomMotion > viewConfiguration.touchSlop || accumulatedPan.getDistance() > viewConfiguration.touchSlop)
                                ) {
                                    pinch = true
                                    horizontalPan = false
                                }
                                if (
                                    !multiple && !pinch && !horizontalPan && !verticalPan &&
                                    accumulatedPan.getDistance() > viewConfiguration.touchSlop
                                ) {
                                    horizontalPan = state.scale > 1f && abs(accumulatedPan.x) > abs(accumulatedPan.y)
                                    verticalPan = !horizontalPan
                                }
                                state.hasMultiplePointers = multiple || pinch
                                if (pinch || horizontalPan) {
                                    val centroid = event.calculateCentroid()
                                    if (centroid != Offset.Unspecified) state.centroid = centroid
                                    if (pinch && state.anchor == null) {
                                        val previousCentroid = event.calculateCentroid(useCurrent = false)
                                        state.anchor =
                                            listState.layoutInfo.visibleItemsInfo.firstOrNull { item ->
                                                previousCentroid.y >= item.offset && previousCentroid.y < item.offset + item.size
                                            }?.let { item ->
                                                ReaderZoomAnchor(item.key, (previousCentroid.y - item.offset) / item.size)
                                            }
                                    }
                                    applyTransform(zoom, pan, allowVerticalPan = pinch)
                                    // Claim transforms before the list or Telephoto sees them. Single-finger
                                    // vertical input stays unconsumed for their existing pan/fling behavior.
                                    event.changes.filter { it.positionChanged() }.forEach { it.consume() }
                                }
                            } while (event.changes.any { it.pressed })
                        } finally {
                            state.hasMultiplePointers = false
                            state.anchor = null
                        }
                    }
                },
    ) {
        Box(
            Modifier.fillMaxSize().layout { measurable, constraints ->
                val width = (constraints.maxWidth * state.scale).roundToInt().coerceAtLeast(1)
                val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
                state.measuredScale = state.scale
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.placeRelative(state.offsetX.roundToInt(), 0)
                }
            },
        ) {
            content()
        }
    }
}
