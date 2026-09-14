package de.ixacg.animestream.ui.components

object HtmlAdPolicy {
    const val MAX_WIDTH = 1920
    const val MAX_HEIGHT = 600

    data class Dimensions(val width: Int = 0, val height: Int = 0)

    fun dimensions(
        width: Int,
        height: Int,
    ): Dimensions =
        if (width > 0 && height > 0) {
            Dimensions(width.coerceAtMost(MAX_WIDTH), height.coerceAtMost(MAX_HEIGHT))
        } else {
            Dimensions()
        }

    fun measuredHeight(height: Double): Float? = height.takeIf { it.isFinite() && it > 0 }?.coerceAtMost(MAX_HEIGHT.toDouble())?.toFloat()

    /**
     * Scale that places a fixed creative inside a slot without cropping. Banners fit the slot
     * width and may grow to fill two poster columns; poster cards additionally respect the slot
     * height so a 300x250 or 300x600 creative is letterboxed instead of cut off.
     */
    fun fitScale(
        slotWidth: Float,
        slotHeight: Float?,
        creative: Dimensions,
        allowUpscale: Boolean,
    ): Float {
        if (creative.width <= 0 || creative.height <= 0 || !(slotWidth > 0f)) return 1f
        var scale = slotWidth / creative.width
        if (slotHeight != null && slotHeight > 0f) scale = minOf(scale, slotHeight / creative.height)
        if (!allowUpscale) scale = scale.coerceAtMost(1f)
        return if (scale.isFinite() && scale > 0f) scale else 1f
    }
}
