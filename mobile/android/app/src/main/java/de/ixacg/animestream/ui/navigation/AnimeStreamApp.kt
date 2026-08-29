package de.ixacg.animestream.ui.navigation

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CollectionsBookmark
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import de.ixacg.animestream.player.PlayerScreen
import de.ixacg.animestream.reader.ReaderScreen
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.catalog.DiscoverScreen
import de.ixacg.animestream.ui.catalog.HomeScreen
import de.ixacg.animestream.ui.catalog.MangaCatalogScreen
import de.ixacg.animestream.ui.detail.AnimeDetailScreen
import de.ixacg.animestream.ui.detail.MangaDetailScreen
import de.ixacg.animestream.ui.library.AccountScreen
import de.ixacg.animestream.ui.library.LibraryScreen
import de.ixacg.animestream.ui.library.LoginScreen

private data class MainDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private val mainDestinations =
    listOf(
        MainDestination("home", "首页", Icons.Default.Home),
        MainDestination("discover", "发现", Icons.Default.Explore),
        MainDestination("manga", "漫画", Icons.Default.MenuBook),
        MainDestination("library", "书架", Icons.Default.CollectionsBookmark),
        MainDestination("account", "我的", Icons.Default.Person),
    )

@Composable
fun AnimeStreamApp(viewModel: AnimeStreamViewModel) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val route = backStackEntry?.destination?.route
    val showNavigation = mainDestinations.any { destination -> route == destination.route }
    val immersive = route?.startsWith("player/") == true || route?.startsWith("reader/") == true
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val useRail = maxWidth >= 700.dp && showNavigation
        if (useRail) {
            Row(Modifier.fillMaxSize()) {
                MainNavigationRail(navController)
                AppNavHost(
                    navController,
                    viewModel,
                    Modifier.weight(1f).windowInsetsPadding(
                        WindowInsets.safeDrawing.only(
                            WindowInsetsSides.Top + WindowInsetsSides.End + WindowInsetsSides.Bottom,
                        ),
                    ),
                )
            }
        } else if (showNavigation) {
            Column(Modifier.fillMaxSize()) {
                AppNavHost(
                    navController,
                    viewModel,
                    Modifier.weight(1f).windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal),
                    ),
                )
                MainNavigationBar(navController)
            }
        } else {
            val contentModifier =
                if (immersive) {
                    Modifier.fillMaxSize()
                } else {
                    Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)
                }
            AppNavHost(navController, viewModel, contentModifier)
        }
    }
}

@Composable
private fun MainNavigationBar(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    val current by navController.currentBackStackEntryAsState()
    NavigationBar(modifier = modifier, containerColor = MaterialTheme.colorScheme.surfaceVariant) {
        mainDestinations.forEach { destination ->
            val selected = current?.destination?.hierarchy?.any { it.route == destination.route } == true
            NavigationBarItem(
                selected = selected,
                onClick = { navController.navigateMain(destination.route) },
                icon = { Icon(destination.icon, contentDescription = null) },
                label = { Text(destination.label) },
            )
        }
    }
}

@Composable
private fun MainNavigationRail(navController: NavHostController) {
    val current by navController.currentBackStackEntryAsState()
    NavigationRail(containerColor = MaterialTheme.colorScheme.surfaceVariant) {
        mainDestinations.forEach { destination ->
            val selected = current?.destination?.hierarchy?.any { it.route == destination.route } == true
            NavigationRailItem(
                selected = selected,
                onClick = { navController.navigateMain(destination.route) },
                icon = { Icon(destination.icon, contentDescription = null) },
                label = { Text(destination.label) },
            )
        }
    }
}

@Composable
private fun AppNavHost(
    navController: NavHostController,
    viewModel: AnimeStreamViewModel,
    modifier: Modifier,
) {
    fun animeDetail(id: Long) = navController.navigate("anime/$id")

    fun mangaDetail(id: Long) = navController.navigate("manga-detail/$id")

    fun reader(
        mangaId: Long,
        chapter: Double,
        page: Int = 0,
    ) = navController.navigate("reader/$mangaId/${chapter.toRouteNumber()}?page=${page.coerceAtLeast(0)}")

    NavHost(navController = navController, startDestination = "home", modifier = modifier) {
        composable("home") {
            HomeScreen(
                viewModel = viewModel,
                onAnime = ::animeDetail,
                onManga = ::mangaDetail,
                onAllManga = { navController.navigateMain("manga") },
            )
        }
        composable("discover") {
            DiscoverScreen(viewModel = viewModel, onAnime = ::animeDetail)
        }
        composable("manga") {
            MangaCatalogScreen(viewModel = viewModel, onManga = ::mangaDetail)
        }
        composable("library") {
            LibraryScreen(
                viewModel = viewModel,
                onAnime = ::animeDetail,
                onManga = ::mangaDetail,
                onReader = ::reader,
            )
        }
        composable("account") {
            AccountScreen(viewModel = viewModel, onLogin = { navController.navigate("login") })
        }
        composable("login") {
            LoginScreen(
                viewModel = viewModel,
                onBack = navController::navigateUp,
                onSuccess = { navController.popBackStack() },
            )
        }
        composable(
            route = "anime/{animeId}",
            arguments = listOf(navArgument("animeId") { type = NavType.LongType }),
            deepLinks =
                listOf(
                    navDeepLink { uriPattern = "animestream://anime/{animeId}" },
                    navDeepLink { uriPattern = "animestream://detail/{animeId}" },
                ),
        ) { entry ->
            val id = entry.arguments?.getLong("animeId") ?: return@composable
            AnimeDetailScreen(
                animeId = id,
                viewModel = viewModel,
                onBack = navController::navigateUp,
                onPlay = { navController.navigate("player/$it") },
                onAnime = ::animeDetail,
                onTag = { tag ->
                    viewModel.setAnimeTag(tag)
                    navController.navigateMain("discover")
                },
            )
        }
        composable(
            route = "manga-detail/{mangaId}",
            arguments = listOf(navArgument("mangaId") { type = NavType.LongType }),
            deepLinks =
                listOf(
                    navDeepLink { uriPattern = "animestream://manga/{mangaId}" },
                    navDeepLink { uriPattern = "animestream://manga-detail/{mangaId}" },
                ),
        ) { entry ->
            val id = entry.arguments?.getLong("mangaId") ?: return@composable
            MangaDetailScreen(
                mangaId = id,
                viewModel = viewModel,
                onBack = navController::navigateUp,
                onRead = { mangaId, chapter -> reader(mangaId, chapter) },
                onManga = ::mangaDetail,
                onTag = { tag ->
                    viewModel.setMangaTag(tag)
                    navController.navigateMain("manga")
                },
            )
        }
        composable(
            route = "player/{animeId}",
            arguments = listOf(navArgument("animeId") { type = NavType.LongType }),
            deepLinks = listOf(navDeepLink { uriPattern = "animestream://player/{animeId}" }),
        ) { entry ->
            val id = entry.arguments?.getLong("animeId") ?: return@composable
            PlayerScreen(id, viewModel, navController::navigateUp)
        }
        composable(
            route = "reader/{mangaId}/{chapter}?page={page}",
            arguments =
                listOf(
                    navArgument("mangaId") { type = NavType.LongType },
                    navArgument("chapter") { type = NavType.StringType },
                    navArgument("page") {
                        type = NavType.IntType
                        defaultValue = 0
                    },
                ),
            deepLinks =
                listOf(
                    navDeepLink { uriPattern = "animestream://reader/{mangaId}/{chapter}" },
                    navDeepLink { uriPattern = "animestream://reader/{mangaId}/{chapter}?page={page}" },
                    navDeepLink { uriPattern = "animestream://manga-reader/{mangaId}/{chapter}" },
                    navDeepLink { uriPattern = "animestream://manga-reader/{mangaId}/{chapter}?page={page}" },
                ),
        ) { entry ->
            val id = entry.arguments?.getLong("mangaId") ?: return@composable
            val chapter = entry.arguments?.getString("chapter")?.toDoubleOrNull() ?: return@composable
            val page = entry.arguments?.getInt("page") ?: 0
            ReaderScreen(
                mangaId = id,
                chapterNumber = chapter,
                initialPage = page,
                viewModel = viewModel,
                onBack = navController::navigateUp,
                onChapter = { next ->
                    navController.navigate("reader/$id/${next.toRouteNumber()}?page=0") {
                        popUpTo(entry.destination.id) { inclusive = true }
                    }
                },
            )
        }
    }
}

private fun NavHostController.navigateMain(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun Double.toRouteNumber(): String = if (this % 1.0 == 0.0) toLong().toString() else toString()
