package de.ixacg.animestream.player

import de.ixacg.animestream.core.model.PlayerPreRollAd

object PlayerAdPolicy {
    enum class PreRollDecision {
        Waiting,
        Show,
        Skip,
    }

    data class PreRollTiming(
        val closeDelaySeconds: Int,
        val totalDurationSeconds: Int,
    )

    fun hasContent(
        videoUrl: String,
        imageUrl: String,
        html: String,
    ): Boolean = videoUrl.isNotBlank() || imageUrl.isNotBlank() || html.isNotBlank()

    fun preRollDecision(
        adsReady: Boolean,
        ad: PlayerPreRollAd,
    ): PreRollDecision =
        when {
            !adsReady -> PreRollDecision.Waiting
            ad.enabled && hasContent(ad.videoUrl, ad.imageUrl, ad.html) -> PreRollDecision.Show
            else -> PreRollDecision.Skip
        }

    fun normalizePreRollTiming(
        closeDelaySeconds: Int,
        totalDurationSeconds: Int,
    ): PreRollTiming {
        val closeDelay = closeDelaySeconds.coerceIn(0, 120)
        val requestedTotal = totalDurationSeconds.coerceIn(0, 180)
        val total = (if (requestedTotal == 0) maxOf(closeDelay, 5) else requestedTotal).coerceAtLeast(closeDelay)
        return PreRollTiming(closeDelay, total)
    }

    fun canDismissPreRoll(
        elapsedSeconds: Int,
        closeDelaySeconds: Int,
        totalDurationSeconds: Int,
    ): Boolean = elapsedSeconds >= closeDelaySeconds.coerceIn(0, totalDurationSeconds.coerceAtLeast(1))

    fun shouldShowPauseAd(
        playbackStarted: Boolean,
        blockedByPreRoll: Boolean,
        isEnded: Boolean,
        isPlaying: Boolean,
        playWhenReady: Boolean,
        pausedByLifecycle: Boolean,
    ): Boolean =
        playbackStarted &&
            !blockedByPreRoll &&
            !pausedByLifecycle &&
            !isEnded &&
            !isPlaying &&
            !playWhenReady
}
