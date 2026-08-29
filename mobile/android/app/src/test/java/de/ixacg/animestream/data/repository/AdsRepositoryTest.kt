package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.FeedAdSlot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdsRepositoryTest {
    @Test
    fun `interleaves every enabled slot using clamped interval`() {
        val ads =
            listOf(
                FeedAdSlot(enabled = true, name = "fast", interval = 0),
                FeedAdSlot(enabled = true, name = "slow", interval = 50),
                FeedAdSlot(enabled = false, name = "off", interval = 1)
            )
        val result = AdsRepository.interleave((1..40).toList(), ads) { item, _ -> "item-$item" }
        val adRows = result.filterIsInstance<FeedEntry.Ad>()

        assertEquals(41, adRows.size)
        assertEquals(40, adRows.count { it.value.name == "fast" })
        assertEquals(1, adRows.count { it.value.name == "slow" })
        assertTrue(adRows.none { it.value.name == "off" })
    }
}
