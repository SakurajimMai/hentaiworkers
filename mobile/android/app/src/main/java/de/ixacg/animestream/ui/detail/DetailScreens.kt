package de.ixacg.animestream.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.MangaSummary
import de.ixacg.animestream.core.model.Tag
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.AnimePosterCard
import de.ixacg.animestream.ui.components.MangaPosterCard
import de.ixacg.animestream.ui.components.RemoteImage
import de.ixacg.animestream.ui.components.ScreenHeader
import de.ixacg.animestream.ui.components.statePane
import de.ixacg.animestream.ui.library.formatChapter

@Composable
fun AnimeDetailScreen(
    animeId: Long,
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
    onPlay: (Long) -> Unit,
    onAnime: (Long) -> Unit,
    onTag: (Tag) -> Unit,
) {
    val state by viewModel.animeDetail.collectAsStateWithLifecycle()
    var lightboxUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(animeId) { viewModel.loadAnimeDetail(animeId) }
    val content = state.value?.takeIf { it.anime.id == animeId }
    if (
        statePane(
            loading = state.loading || content == null && state.error == null,
            error = state.error,
            empty = false,
            emptyText = "",
            onRetry = { viewModel.loadAnimeDetail(animeId) },
        )
    ) {
        return
    }
    val detail = content ?: return
    val anime = detail.anime
    val stills =
        remember(anime.cover, anime.fanart) {
            (listOfNotNull(MediaUrlNormalizer.normalize(anime.cover)) + MediaUrlNormalizer.split(anime.fanart)).distinct()
        }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 40.dp),
    ) {
        item {
            ScreenHeader(
                title = anime.title,
                subtitle = anime.titleJapanese ?: anime.titleEnglish,
                onBack = onBack,
                actions = {
                    IconButton(onClick = viewModel::toggleAnimeFavorite, modifier = Modifier.size(48.dp)) {
                        Icon(
                            if (detail.favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = if (detail.favorite) "取消收藏" else "收藏",
                            tint = if (detail.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                },
            )
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalAlignment = Alignment.Top,
            ) {
                RemoteImage(
                    url = anime.cover,
                    contentDescription = "${anime.title} 封面",
                    modifier = Modifier.width(136.dp).height(204.dp),
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(anime.title, style = MaterialTheme.typography.headlineMedium)
                    Text(
                        listOfNotNull(anime.releaseYear?.toString(), anime.releaseDate).joinToString(" · ").ifBlank { "里番" },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "${anime.viewCount ?: 0} 次观看 · ${anime.favoriteCount ?: 0} 收藏",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = { onPlay(anime.id) },
                        enabled = MediaUrlNormalizer.normalize(anime.videoUrl) != null,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(if (anime.videoUrl.isNullOrBlank()) "暂无片源" else "播放")
                    }
                }
            }
        }
        if (anime.tags.isNotEmpty()) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(anime.tags, key = Tag::id) { tag ->
                        FilterChip(selected = false, onClick = { onTag(tag) }, label = { Text(tag.name) })
                    }
                }
            }
        }
        if (!anime.description.isNullOrBlank()) {
            item {
                Section(title = "简介") {
                    Text(anime.description.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        if (stills.isNotEmpty()) {
            item {
                Section(title = "剧照") {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(stills, key = { it }) { url ->
                            RemoteImage(
                                url = url,
                                contentDescription = "${anime.title} 剧照",
                                modifier = Modifier.width(220.dp).height(132.dp).clickable { lightboxUrl = url },
                            )
                        }
                    }
                }
            }
        }
        if (detail.similar.isNotEmpty()) {
            item {
                Section(title = "相似推荐") {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(detail.similar, key = { it.id }) { item ->
                            AnimePosterCard(
                                anime = item,
                                onClick = { onAnime(item.id) },
                                modifier = Modifier.width(128.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    lightboxUrl?.let { url ->
        Dialog(
            onDismissRequest = { lightboxUrl = null },
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        ) {
            Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                RemoteImage(
                    url = url,
                    contentDescription = "剧照大图",
                    modifier = Modifier.fillMaxSize().clickable { lightboxUrl = null },
                    contentScale = ContentScale.Fit,
                )
                IconButton(
                    onClick = { lightboxUrl = null },
                    modifier = Modifier.align(Alignment.TopEnd).padding(16.dp).size(48.dp),
                ) {
                    Icon(Icons.Default.Close, contentDescription = "关闭大图", tint = Color.White)
                }
            }
        }
    }
}

@Composable
fun MangaDetailScreen(
    mangaId: Long,
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
    onRead: (Long, Double) -> Unit,
    onManga: (Long) -> Unit,
    onTag: (String) -> Unit,
) {
    val state by viewModel.mangaDetail.collectAsStateWithLifecycle()
    LaunchedEffect(mangaId) { viewModel.loadMangaDetail(mangaId) }
    val content = state.value?.takeIf { it.manga.id == mangaId }
    if (
        statePane(
            loading = state.loading || content == null && state.error == null,
            error = state.error,
            empty = false,
            emptyText = "",
            onRetry = { viewModel.loadMangaDetail(mangaId) },
        )
    ) {
        return
    }
    val detail = content ?: return
    val manga = detail.manga
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 40.dp),
    ) {
        item {
            ScreenHeader(
                title = manga.title,
                subtitle = manga.author,
                onBack = onBack,
                actions = {
                    IconButton(onClick = viewModel::toggleMangaFavorite, modifier = Modifier.size(48.dp)) {
                        Icon(
                            if (detail.favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = if (detail.favorite) "取消收藏" else "收藏",
                            tint = if (detail.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                },
            )
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                RemoteImage(
                    url = manga.coverUrl,
                    contentDescription = "${manga.title} 封面",
                    modifier = Modifier.width(136.dp).height(204.dp),
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(manga.title, style = MaterialTheme.typography.headlineMedium)
                    Text(manga.author ?: "作者未知", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "${manga.chapterCount} 话 · ${manga.pageCount} 页",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = { manga.chapters.firstOrNull()?.let { onRead(manga.id, it.number) } },
                        enabled = manga.chapters.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) {
                        Icon(Icons.Default.MenuBook, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(if (manga.chapters.isEmpty()) "暂无章节" else "开始阅读")
                    }
                }
            }
        }
        if (manga.tags.isNotEmpty()) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(manga.tags, key = { it }) { tag ->
                        FilterChip(selected = false, onClick = { onTag(tag) }, label = { Text(tag) })
                    }
                }
            }
        }
        if (!manga.description.isNullOrBlank()) {
            item {
                Section(title = "简介") {
                    Text(manga.description.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        item {
            Section(title = "章节") {
                if (manga.chapters.isEmpty()) {
                    Text("暂无可阅读章节", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Column {
                        manga.chapters.forEach { chapter ->
                            Row(
                                modifier =
                                    Modifier.fillMaxWidth().clickable { onRead(manga.id, chapter.number) }
                                        .heightIn(min = 56.dp).padding(vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("第 ${formatChapter(chapter.number)} 话")
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
                        }
                    }
                }
            }
        }
        if (detail.recommendations.isNotEmpty()) {
            item {
                Section(title = "推荐漫画") {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(detail.recommendations, key = MangaSummary::id) { item ->
                            MangaPosterCard(
                                manga = item,
                                onClick = { onManga(item.id) },
                                modifier = Modifier.width(128.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        content()
    }
}
