package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.FeedAdSlot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdsRepositoryTest {
    @Test
    fun `one slot per position is drawn from the intervals that land there`() {
        val ads =
            listOf(
                FeedAdSlot(enabled = true, name = "fast", interval = 0),
                FeedAdSlot(enabled = true, name = "slow", interval = 50),
                FeedAdSlot(enabled = false, name = "off", interval = 1),
            )
        val result = AdsRepository.interleave((1..40).toList(), ads, { 0 }) { item, _ -> "item-$item" }
        val adRows = result.filterIsInstance<FeedEntry.Ad>()

        // 0 clamps to every position and 50 clamps to the fortieth; the position both reach still
        // carries a single card, and the disabled slot never enters the draw.
        assertEquals(40, adRows.size)
        assertEquals(39, adRows.count { it.value.name == "fast" })
        assertEquals(1, adRows.count { it.value.name == "slow" })
        assertTrue(adRows.none { it.value.name == "off" })
        assertEquals("ad-1-40", adRows.last().key)
    }

    @Test
    fun `six creatives rotate through the feed instead of stacking at every position`() {
        val ads = List(6) { FeedAdSlot(enabled = true, name = "creative-$it", interval = 6) }
        val entries = AdsRepository.interleave((1..48).toList(), ads, { 0 }) { item, _ -> "item-$item" }
        val adRows = entries.filterIsInstance<FeedEntry.Ad>()

        assertEquals(8, adRows.size)
        // A draw that always takes the first candidate still alternates: the slot shown at the
        // previous position stands aside while another candidate is available.
        assertEquals(
            List(8) { "creative-${it % 2}" },
            adRows.map { it.value.name },
        )
        assertEquals(
            listOf("ad-0-6", "ad-1-12", "ad-0-18", "ad-1-24", "ad-0-30", "ad-1-36", "ad-0-42", "ad-1-48"),
            adRows.map { it.key },
        )
    }

    @Test
    fun `the default draw reaches every configured creative`() {
        val ads = List(6) { FeedAdSlot(enabled = true, name = "creative-$it", interval = 6) }
        val names =
            AdsRepository.interleave((1..600).toList(), ads) { item, _ -> "item-$item" }
                .filterIsInstance<FeedEntry.Ad>()
                .map { it.value.name }
                .toSet()

        assertEquals(6, names.size)
    }
}
