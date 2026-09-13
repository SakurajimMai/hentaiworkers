package de.ixacg.animestream.ui.navigation

internal const val RAIL_MIN_WIDTH_DP = 700f

internal val MAIN_DESTINATION_ROUTES = setOf("home", "discover", "manga", "library", "account")

internal data class NavigationChrome(
    val showBottomBar: Boolean,
    val showRail: Boolean,
    val immersive: Boolean,
    val insetTop: Boolean,
    val insetStart: Boolean,
    val insetEnd: Boolean,
    val insetBottom: Boolean,
)

internal fun isMainDestination(route: String?): Boolean = route != null && route in MAIN_DESTINATION_ROUTES

internal fun isImmersiveDestination(route: String?): Boolean =
    route?.startsWith("player/") == true || route?.startsWith("reader/") == true

/**
 * Chrome flags for a destination. Bottom bar and rail may hide, but the NavHost always stays in
 * the same Row/Column slot so catalog scroll state survives opening a title and pressing back.
 */
internal fun navigationChrome(
    route: String?,
    widthDp: Float,
    railMinWidthDp: Float = RAIL_MIN_WIDTH_DP,
): NavigationChrome {
    val main = isMainDestination(route)
    val immersive = isImmersiveDestination(route)
    val showRail = main && widthDp >= railMinWidthDp
    val showBottomBar = main && !showRail
    return when {
        immersive ->
            NavigationChrome(
                showBottomBar = false,
                showRail = false,
                immersive = true,
                insetTop = false,
                insetStart = false,
                insetEnd = false,
                insetBottom = false,
            )
        showRail ->
            NavigationChrome(
                showBottomBar = false,
                showRail = true,
                immersive = false,
                insetTop = true,
                insetStart = false,
                insetEnd = true,
                insetBottom = true,
            )
        showBottomBar ->
            NavigationChrome(
                showBottomBar = true,
                showRail = false,
                immersive = false,
                insetTop = true,
                insetStart = true,
                insetEnd = true,
                insetBottom = false,
            )
        else ->
            NavigationChrome(
                showBottomBar = false,
                showRail = false,
                immersive = false,
                insetTop = true,
                insetStart = true,
                insetEnd = true,
                insetBottom = true,
            )
    }
}
