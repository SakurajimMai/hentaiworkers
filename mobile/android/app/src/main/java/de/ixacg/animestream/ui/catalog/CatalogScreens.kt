package de.ixacg.animestream.ui.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.ixacg.animestream.core.model.MangaRank
import de.ixacg.animestream.core.model.MangaSummary
import de.ixacg.animestream.data.repository.AdsRepository
import de.ixacg.animestream.data.repository.FeedEntry
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.AnimePosterCard
import de.ixacg.animestream.ui.components.CatalogSearch
import de.ixacg.animestream.ui.components.FeedAdCard
import de.ixacg.animestream.ui.components.InlineRetryMessage
import de.ixacg.animestream.ui.components.MangaPosterCard
import de.ixacg.animestream.ui.components.ScreenHeader
import de.ixacg.animestream.ui.components.statePane
import kotlinx.coroutines.flow.distinctUntilChanged

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: AnimeStreamViewModel,
    onAnime: (Long) -> Unit,
    onManga: (Long) -> Unit,
    onAllManga: () -> Unit,
) {
    val state by viewModel.home.collectAsStateWithLifecycle()
    val ads by viewModel.adsState.collectAsStateWithLifecycle()
    PullToRefreshBox(
        isRefreshing = state.loading && state.value != null,
        onRefresh = { viewModel.refreshHome(forceAds = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        val content = state.value
        val inlineError = state.error.takeIf { content != null }
        if (
            statePane(
                loading = state.loading && content == null,
                error = state.error.takeIf { content == null },
                empty =
                    state.error == null &&
                        content != null &&
                        content.animes.isEmpty() &&
                        content.mangas.isEmpty(),
                emptyText = "暂时没有可浏览的内容",
                onRetry = { viewModel.refreshHome() },
            )
        ) {
            return@PullToRefreshBox
        }
        val entries =
            remember(content?.animes, ads.config.feedSlots) {
                AdsRepository.interleave(content?.animes.orEmpty(), ads.config.feedSlots) { anime, _ -> "anime-${anime.id}" }
            }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(112.dp),
            contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "home-heading") {
                Column {
                    Text("AnimeStream", style = MaterialTheme.typography.headlineLarge)
                    Text(
                        "今晚想看点什么",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            if (inlineError != null) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "home-inline-error") {
                    InlineRetryMessage(
                        message = inlineError,
                        onRetry = { viewModel.refreshHome() },
                    )
                }
            }
            if (!content?.mangas.isNullOrEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "manga-heading") {
                    ScreenHeader(title = "漫画新作", subtitle = "连续阅读") {
                        FilterChip(selected = false, onClick = onAllManga, label = { Text("全部") })
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }, key = "manga-strip") {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp),
                    ) {
                        items(content?.mangas.orEmpty(), key = MangaSummary::id) { manga ->
                            MangaPosterCard(
                                manga = manga,
                                onClick = { onManga(manga.id) },
                                modifier = Modifier.width(128.dp),
                            )
                        }
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }, key = "anime-heading") {
                ScreenHeader(title = "热门里番", subtitle = "按热度更新")
            }
            items(
                items = entries,
                key = { it.key },
                span = { entry -> if (entry is FeedEntry.Ad) GridItemSpan(maxLineSpan) else GridItemSpan(1) },
            ) { entry ->
                when (entry) {
                    is FeedEntry.Content ->
                        AnimePosterCard(entry.value, onClick = { onAnime(entry.value.id) })
                    is FeedEntry.Ad -> FeedAdCard(entry.value)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    viewModel: AnimeStreamViewModel,
    onAnime: (Long) -> Unit,
) {
    val state by viewModel.discover.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val ads by viewModel.adsState.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf(state.query) }
    val gridState = rememberLazyGridState()
    LaunchedEffect(Unit) {
        viewModel.ensureDiscoverLoaded()
        viewModel.ensureAdsLoaded()
    }
    LaunchedEffect(state.query) { if (query != state.query) query = state.query }
    val entries =
        remember(state.items, ads.config.feedSlots) {
            AdsRepository.interleave(state.items, ads.config.feedSlots) { anime, _ -> "anime-${anime.id}" }
        }
    val pane =
        catalogPaneState(
            itemCount = state.items.size,
            hasLoaded = state.hasLoaded,
            loading = state.loading,
            error = state.error,
        )
    LaunchedEffect(gridState, entries.size, state.page, state.totalPages) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .distinctUntilChanged()
            .collect { index ->
                if (entries.isNotEmpty() && index >= entries.lastIndex - 6) viewModel.loadMoreAnimes()
            }
    }

    PullToRefreshBox(
        isRefreshing = state.loading && state.items.isNotEmpty(),
        onRefresh = { viewModel.refreshDiscover(forceAds = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(112.dp),
            state = gridState,
            contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "discover-controls") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ScreenHeader(title = "发现", subtitle = "搜索与标签筛选")
                    CatalogSearch(
                        value = query,
                        placeholder = "标题、日文名或简介",
                        onValueChange = { query = it },
                        onSubmit = { viewModel.searchAnimes(query) },
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item {
                            FilterChip(
                                selected = state.sort == "latest",
                                onClick = { viewModel.setAnimeSort("latest") },
                                label = { Text("最近更新") },
                            )
                        }
                        item {
                            FilterChip(
                                selected = state.sort == "popular",
                                onClick = { viewModel.setAnimeSort("popular") },
                                label = { Text("热门") },
                            )
                        }
                    }
                    if (!tags.value.isNullOrEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            item {
                                FilterChip(
                                    selected = state.selectedTag == null,
                                    onClick = { viewModel.setAnimeTag(null) },
                                    label = { Text("全部标签") },
                                )
                            }
                            items(tags.value.orEmpty(), key = { it.id }) { tag ->
                                FilterChip(
                                    selected = state.selectedTag?.id == tag.id,
                                    onClick = { viewModel.setAnimeTag(tag) },
                                    label = { Text(tag.name) },
                                )
                            }
                        }
                    }
                }
            }
            when (pane) {
                CatalogPaneState.Content -> {
                    state.error?.let { message ->
                        item(span = { GridItemSpan(maxLineSpan) }, key = "anime-inline-error") {
                            InlineRetryMessage(message = message, onRetry = viewModel::refreshDiscover)
                        }
                    }
                    items(
                        items = entries,
                        key = { it.key },
                        span = { entry -> if (entry is FeedEntry.Ad) GridItemSpan(maxLineSpan) else GridItemSpan(1) },
                    ) { entry ->
                        when (entry) {
                            is FeedEntry.Content -> AnimePosterCard(entry.value, onClick = { onAnime(entry.value.id) })
                            is FeedEntry.Ad -> FeedAdCard(entry.value)
                        }
                    }
                }
                else -> {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "anime-catalog-state") {
                        CatalogPane(
                            state = pane,
                            emptyText = "没有找到符合条件的里番",
                            canClear = state.query.isNotBlank() || state.selectedTag != null,
                            onRetry = viewModel::refreshDiscover,
                            onClear = viewModel::clearAnimeFilters,
                        )
                    }
                }
            }
            if (state.loadingMore) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "anime-loading-more") {
                    Box(Modifier.fillMaxWidth().height(72.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MangaCatalogScreen(
    viewModel: AnimeStreamViewModel,
    onManga: (Long) -> Unit,
) {
    val state by viewModel.mangaCatalog.collectAsStateWithLifecycle()
    val ads by viewModel.adsState.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf(state.query) }
    val gridState = rememberLazyGridState()
    LaunchedEffect(Unit) {
        viewModel.ensureMangasLoaded()
        viewModel.ensureAdsLoaded()
    }
    LaunchedEffect(state.query) { if (query != state.query) query = state.query }
    val visibleTags =
        remember(state.items, state.selectedTag) {
            (listOfNotNull(state.selectedTag) + state.items.flatMap(MangaSummary::tags)).distinct().take(20)
        }
    val entries =
        remember(state.items, ads.config.feedSlots) {
            AdsRepository.interleave(state.items, ads.config.feedSlots) { manga, _ -> "manga-${manga.id}" }
        }
    val pane =
        catalogPaneState(
            itemCount = state.items.size,
            hasLoaded = state.hasLoaded,
            loading = state.loading,
            error = state.error,
        )
    LaunchedEffect(gridState, entries.size, state.page, state.totalPages) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .distinctUntilChanged()
            .collect { index ->
                if (entries.isNotEmpty() && index >= entries.lastIndex - 6) viewModel.loadMoreMangas()
            }
    }

    PullToRefreshBox(
        isRefreshing = state.loading && state.items.isNotEmpty(),
        onRefresh = { viewModel.refreshMangas(forceAds = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(112.dp),
            state = gridState,
            contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "manga-controls") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ScreenHeader(title = "漫画", subtitle = "纵向连续阅读")
                    CatalogSearch(
                        value = query,
                        placeholder = "标题、作者或标签",
                        onValueChange = { query = it },
                        onSubmit = { viewModel.searchMangas(query) },
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(MangaRank.entries, key = MangaRank::wireValue) { rank ->
                            FilterChip(
                                selected = state.rank == rank,
                                onClick = { viewModel.setMangaRank(rank) },
                                label = { Text(rank.label) },
                            )
                        }
                    }
                    if (visibleTags.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            item {
                                FilterChip(
                                    selected = state.selectedTag == null,
                                    onClick = { viewModel.setMangaTag(null) },
                                    label = { Text("全部标签") },
                                )
                            }
                            items(visibleTags, key = { it }) { tag ->
                                FilterChip(
                                    selected = state.selectedTag == tag,
                                    onClick = { viewModel.setMangaTag(tag) },
                                    label = { Text(tag) },
                                )
                            }
                        }
                    }
                }
            }
            when (pane) {
                CatalogPaneState.Content -> {
                    state.error?.let { message ->
                        item(span = { GridItemSpan(maxLineSpan) }, key = "manga-inline-error") {
                            InlineRetryMessage(message = message, onRetry = viewModel::refreshMangas)
                        }
                    }
                    items(
                        items = entries,
                        key = { it.key },
                        span = { entry -> if (entry is FeedEntry.Ad) GridItemSpan(maxLineSpan) else GridItemSpan(1) },
                    ) { entry ->
                        when (entry) {
                            is FeedEntry.Content -> MangaPosterCard(entry.value, onClick = { onManga(entry.value.id) })
                            is FeedEntry.Ad -> FeedAdCard(entry.value)
                        }
                    }
                }
                else -> {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "manga-catalog-state") {
                        CatalogPane(
                            state = pane,
                            emptyText = "没有找到符合条件的漫画",
                            canClear = state.query.isNotBlank() || state.selectedTag != null,
                            onRetry = viewModel::refreshMangas,
                            onClear = viewModel::clearMangaFilters,
                        )
                    }
                }
            }
            if (state.loadingMore) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "manga-loading-more") {
                    Box(Modifier.fillMaxWidth().height(72.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
        }
    }
}

@Composable
private fun CatalogPane(
    state: CatalogPaneState,
    emptyText: String,
    canClear: Boolean,
    onRetry: () -> Unit,
    onClear: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        when (state) {
            CatalogPaneState.Loading -> CircularProgressIndicator()
            CatalogPaneState.Empty -> {
                Text(emptyText, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (canClear) {
                    OutlinedButton(onClick = onClear, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text("清除筛选")
                    }
                } else {
                    OutlinedButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Text("刷新")
                    }
                }
            }
            is CatalogPaneState.Error -> {
                Text(state.message, color = MaterialTheme.colorScheme.error)
                Button(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Text("重试")
                }
            }
            CatalogPaneState.Content -> Unit
        }
    }
}
