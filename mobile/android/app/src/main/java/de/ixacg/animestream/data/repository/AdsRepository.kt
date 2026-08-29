package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.FeedAdSlot
import de.ixacg.animestream.core.model.PublicAdsConfig
import de.ixacg.animestream.core.model.ReaderAdSlot
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.apiCall
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface FeedEntry<out T> {
    val key: String

    data class Content<T>(val value: T, override val key: String) : FeedEntry<T>

    data class Ad(val value: FeedAdSlot, override val key: String) : FeedEntry<Nothing>
}

class AdsRepository(private val api: AnimeStreamApi) {
    private val lock = Mutex()
    private var cached: PublicAdsConfig? = null

    suspend fun load(force: Boolean = false): PublicAdsConfig =
        lock.withLock {
            if (!force) cached?.let { return@withLock it }
            val result = runCatching { normalize(apiCall { api.ads() }) }.getOrElse { cached ?: PublicAdsConfig.Empty }
            cached = result
            result
        }

    private fun normalize(raw: PublicAdsConfig): PublicAdsConfig =
        raw.copy(
            feedSlots = raw.feedSlots.filter(FeedAdSlot::enabled),
            reader =
                raw.reader.copy(
                    middle = ReaderAdSlot(),
                ),
        )

    companion object {
        fun <T> interleave(
            items: List<T>,
            ads: List<FeedAdSlot>,
            itemKey: (T, Int) -> String,
        ): List<FeedEntry<T>> =
            buildList {
                val enabled = ads.filter(FeedAdSlot::enabled)
                items.forEachIndexed { index, item ->
                    add(FeedEntry.Content(item, itemKey(item, index)))
                    val seen = index + 1
                    enabled.forEachIndexed { adIndex, ad ->
                        val step = ad.interval.coerceIn(1, 40)
                        if (seen % step == 0) add(FeedEntry.Ad(ad, "ad-$adIndex-$seen"))
                    }
                }
            }
    }
}
