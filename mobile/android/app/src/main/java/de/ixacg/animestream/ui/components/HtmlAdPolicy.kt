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
}
