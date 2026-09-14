package de.ixacg.animestream.core.format

import org.junit.Assert.assertEquals
import org.junit.Test

class CountFormatTest {
    @Test
    fun `counts below a thousand are shown exactly`() {
        assertEquals("0", CountFormat.compact(0))
        assertEquals("7", CountFormat.compact(7))
        assertEquals("999", CountFormat.compact(999))
    }

    @Test
    fun `thousands use k and ten thousands use w, truncated rather than rounded`() {
        assertEquals("1k", CountFormat.compact(1_000))
        // 7.887k must not round up to 7.9k: a shown count may never overstate the real one.
        assertEquals("7.8k", CountFormat.compact(7_887))
        assertEquals("1k", CountFormat.compact(1_099))
        assertEquals("1.1k", CountFormat.compact(1_100))
        assertEquals("9.9k", CountFormat.compact(9_999))
        assertEquals("1w", CountFormat.compact(10_000))
        assertEquals("3.2w", CountFormat.compact(32_000))
        assertEquals("9.9w", CountFormat.compact(99_999))
        assertEquals("100w", CountFormat.compact(1_000_000))
    }

    @Test
    fun `missing and negative counts render as zero`() {
        assertEquals("0", CountFormat.compact(null))
        assertEquals("0", CountFormat.compact(-5))
    }

    @Test
    fun `matches the website formatter for the documented examples`() {
        // lib/format-count.ts must produce the same strings, or the two surfaces disagree.
        assertEquals("1k", CountFormat.compact(1_000))
        assertEquals("7.8k", CountFormat.compact(7_887))
        assertEquals("3.2w", CountFormat.compact(32_000))
    }
}
