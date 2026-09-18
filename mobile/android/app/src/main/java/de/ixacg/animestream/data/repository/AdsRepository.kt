package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.FeedAdSlot
import de.ixacg.animestream.core.model.PublicAdsConfig
import de.ixacg.animestream.core.model.ReaderAdSlot
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.apiCall
import kotlin.random.Random
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
        /**
         * A feed position carries one ad, drawn at random from the slots whose interval lands on
         * it, so six configured creatives rotate through the feed instead of stacking six cards at
         * every position. The draw skips the slot shown at the previous position while another
         * candidate is available. Mirrors `interleaveFeedAds` in
         * lib/server/system/domain/ads-settings-form.ts; [pick] is injected for deterministic tests.
         */
        fun <T> interleave(
            items: List<T>,
            ads: List<FeedAdSlot>,
            pick: (Int) -> Int = { count -> Random.nextInt(count) },
            itemKey: (T, Int) -> String,
        ): List<FeedEntry<T>> =
            buildList {
                val enabled = ads.withIndex().filter { it.value.enabled }
                var previous = -1
                items.forEachIndexed { index, item ->
                    add(FeedEntry.Content(item, itemKey(item, index)))
                    val seen = index + 1
                    val eligible = enabled.filter { seen % it.value.interval.coerceIn(1, 40) == 0 }
                    if (eligible.isEmpty()) return@forEachIndexed
                    val candidates =
                        if (eligible.size > 1) eligible.filterNot { it.index == previous } else eligible
                    val chosen = candidates[pick(candidates.size).coerceIn(0, candidates.size - 1)]
                    previous = chosen.index
                    add(FeedEntry.Ad(chosen.value, "ad-${chosen.index}-$seen"))
                }
            }
    }
}
