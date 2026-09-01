package de.ixacg.animestream.ui.navigation

internal fun shouldForwardAppDeepLink(
    action: String?,
    data: String?,
): Boolean =
    action == ANDROID_VIEW_ACTION &&
        data?.trim()?.startsWith("$APP_DEEP_LINK_SCHEME://", ignoreCase = true) == true

private const val ANDROID_VIEW_ACTION = "android.intent.action.VIEW"
private const val APP_DEEP_LINK_SCHEME = "animestream"
