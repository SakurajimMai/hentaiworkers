package de.ixacg.animestream.ui.components

object HtmlAdPolicy {
    const val MaxWidth = 1920
    const val MaxHeight = 600

    data class Dimensions(val width: Int = 0, val height: Int = 0)

    fun dimensions(width: Int, height: Int): Dimensions =
        if (width > 0 && height > 0) {
            Dimensions(width.coerceAtMost(MaxWidth), height.coerceAtMost(MaxHeight))
        } else {
            Dimensions()
        }

    fun measuredHeight(height: Double): Float? =
        height.takeIf { it.isFinite() && it > 0 }?.coerceAtMost(MaxHeight.toDouble())?.toFloat()
}
