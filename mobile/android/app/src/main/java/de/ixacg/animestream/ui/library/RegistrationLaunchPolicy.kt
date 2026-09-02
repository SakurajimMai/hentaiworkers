package de.ixacg.animestream.ui.library

import de.ixacg.animestream.core.media.MediaUrlNormalizer

internal object RegistrationLaunchPolicy {
    fun registrationUrl(rawOrigin: String? = MediaUrlNormalizer.origin): String =
        "${MediaUrlNormalizer.validatedOrigin(rawOrigin)}/register"

    fun launch(
        rawOrigin: String? = MediaUrlNormalizer.origin,
        openExternalUrl: (String) -> Boolean,
    ): Boolean = runCatching { openExternalUrl(registrationUrl(rawOrigin)) }.getOrDefault(false)
}
