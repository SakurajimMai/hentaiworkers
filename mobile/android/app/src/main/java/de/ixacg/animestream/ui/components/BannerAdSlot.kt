package de.ixacg.animestream.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import de.ixacg.animestream.core.model.BannerAd

@Composable
fun BannerAdSlot(
    banner: BannerAd,
    modifier: Modifier = Modifier,
) {
    val widthDp = LocalConfiguration.current.screenWidthDp
    val creative = remember(banner, widthDp) { BannerAdPolicy.select(banner, widthDp) } ?: return
    HtmlAd(
        creative.html,
        modifier = modifier.fillMaxWidth(),
        width = creative.width,
        height = creative.height,
    )
}
