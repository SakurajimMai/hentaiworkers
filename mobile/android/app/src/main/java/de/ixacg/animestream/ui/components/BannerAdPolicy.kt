package de.ixacg.animestream.ui.components

import de.ixacg.animestream.core.model.BannerAd

object BannerAdPolicy {
    const val DESKTOP_MIN_WIDTH_DP = 768

    data class Creative(
        val html: String,
        val width: Int,
        val height: Int,
    )

    fun select(
        banner: BannerAd,
        screenWidthDp: Int,
    ): Creative? {
        val desktop = banner.desktopHtml.trim()
        val mobile = banner.mobileHtml.trim()
        return if (screenWidthDp >= DESKTOP_MIN_WIDTH_DP) {
            when {
                desktop.isNotEmpty() -> Creative(desktop, banner.desktopWidth, banner.desktopHeight)
                mobile.isNotEmpty() -> Creative(mobile, banner.mobileWidth, banner.mobileHeight)
                else -> null
            }
        } else {
            when {
                mobile.isNotEmpty() -> Creative(mobile, banner.mobileWidth, banner.mobileHeight)
                desktop.isNotEmpty() -> Creative(desktop, banner.desktopWidth, banner.desktopHeight)
                else -> null
            }
        }
    }

    fun hasCreative(banner: BannerAd): Boolean = banner.desktopHtml.isNotBlank() || banner.mobileHtml.isNotBlank()
}
