package de.ixacg.animestream.core.format

import java.util.Locale

/**
 * Compact counts for reader-facing text, matching the website's `formatCompactCount`:
 * 999 stays 999, 1000 becomes 1k, 7887 becomes 7.8k and 32000 becomes 3.2w (万).
 * Values are truncated, never rounded up, so a displayed number cannot overstate the real count.
 */
object CountFormat {
    private const val THOUSAND = 1_000.0
    private const val TEN_THOUSAND = 10_000.0

    fun compact(value: Long?): String {
        val count = value ?: 0L
        if (count <= 0L) return "0"
        if (count < THOUSAND) return count.toString()
        return if (count < TEN_THOUSAND) {
            "${truncateToOneDecimal(count / THOUSAND)}k"
        } else {
            "${truncateToOneDecimal(count / TEN_THOUSAND)}w"
        }
    }

    private fun truncateToOneDecimal(value: Double): String {
        val truncated = Math.floor(value * 10) / 10
        return if (truncated % 1.0 == 0.0) {
            truncated.toLong().toString()
        } else {
            String.format(Locale.ROOT, "%.1f", truncated)
        }
    }
}
