package de.ixacg.animestream.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdsLoadPolicyTest {
    @Test
    fun `starts only a missing or explicitly refreshed ads load`() {
        assertTrue(shouldStartAdsLoad(ready = false, active = false, force = false))
        assertFalse(shouldStartAdsLoad(ready = false, active = true, force = false))
        assertFalse(shouldStartAdsLoad(ready = true, active = false, force = false))
        assertTrue(shouldStartAdsLoad(ready = true, active = false, force = true))
        assertFalse(shouldStartAdsLoad(ready = true, active = true, force = true))
    }
}
