package de.ixacg.animestream.ui.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.ixacg.animestream.core.model.LibrarySnapshot
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.RemoteImage
import de.ixacg.animestream.ui.components.ScreenHeader
import de.ixacg.animestream.ui.components.statePane
import java.text.DateFormat
import java.util.Date

private data class LibraryRowModel(
    val key: String,
    val kind: String,
    val id: Long,
    val title: String,
    val subtitle: String,
    val cover: String?,
    val timestamp: Long,
)

@Composable
fun LibraryScreen(
    viewModel: AnimeStreamViewModel,
    onAnime: (Long) -> Unit,
    onManga: (Long) -> Unit,
    onReader: (Long, Double, Int) -> Unit,
) {
    val state by viewModel.libraryState.collectAsStateWithLifecycle()
    val session by viewModel.sessionState.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    LaunchedEffect(session.ready, session.user?.id) {
        if (session.ready) viewModel.refreshLibrary()
    }

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            title = "书架",
            subtitle = if (session.user == null) "当前保存在本机" else "已与 ${session.user?.displayName ?: session.user?.username} 同步",
            actions = {
                IconButton(onClick = { editing = !editing }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.Edit, contentDescription = if (editing) "完成编辑" else "编辑书架")
                }
                if (tab == 1) {
                    IconButton(onClick = { confirmClear = true }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Default.Delete, contentDescription = "清空历史")
                    }
                }
            },
        )
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("收藏") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("历史") })
        }
        val snapshot = state.value
        if (
            statePane(
                loading = state.loading && snapshot == null,
                error = state.error.takeIf { snapshot == null },
                empty = snapshot != null && rows(snapshot, tab).isEmpty(),
                emptyText = if (tab == 0) "书架里还没有收藏" else "还没有观看或阅读记录",
                onRetry = viewModel::refreshLibrary,
                modifier = Modifier.weight(1f),
            )
        ) {
            return@Column
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 32.dp),
        ) {
            items(rows(snapshot ?: LibrarySnapshot(), tab), key = LibraryRowModel::key) { item ->
                LibraryItemRow(
                    item = item,
                    editing = editing,
                    onClick = {
                        when {
                            tab == 1 && item.kind == "manga" -> {
                                val chapter = snapshot?.mangaHistory?.firstOrNull { it.id == item.id }?.chapterNumber ?: 1.0
                                val page = snapshot?.mangaHistory?.firstOrNull { it.id == item.id }?.pageIndex ?: 0
                                onReader(item.id, chapter, page)
                            }
                            item.kind == "anime" -> onAnime(item.id)
                            else -> onManga(item.id)
                        }
                    },
                    onRemove = {
                        if (tab == 0) {
                            viewModel.removeFavorite(item.kind, item.id)
                        } else {
                            viewModel.removeHistory(item.kind, item.id)
                        }
                    },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
            }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("清空全部历史？") },
            text = { Text("里番观看记录和漫画阅读记录都会清除，登录状态下也会同步到账号。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClear = false
                        viewModel.clearHistory()
                    },
                ) { Text("清空") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun LibraryItemRow(
    item: LibraryRowModel,
    editing: Boolean,
    onClick: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RemoteImage(
            url = item.cover,
            contentDescription = "${item.title} 封面",
            modifier = Modifier.width(64.dp).height(96.dp),
        )
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(item.subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(item.timestamp)),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (editing) {
            IconButton(onClick = onRemove, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Default.Delete, contentDescription = "移除 ${item.title}")
            }
        }
    }
}

private fun rows(
    snapshot: LibrarySnapshot,
    tab: Int,
): List<LibraryRowModel> =
    if (tab == 0) {
        (
            snapshot.animeFavorites.map {
                LibraryRowModel(
                    "favorite-anime-${it.id}",
                    "anime",
                    it.id,
                    it.title,
                    it.titleJapanese ?: it.releaseYear?.toString().orEmpty().ifBlank { "里番" },
                    it.cover,
                    it.favoritedAt,
                )
            } +
                snapshot.mangaFavorites.map {
                    LibraryRowModel(
                        "favorite-manga-${it.id}",
                        "manga",
                        it.id,
                        it.title,
                        it.author ?: "漫画",
                        it.coverUrl,
                        it.favoritedAt,
                    )
                }
        ).sortedByDescending(LibraryRowModel::timestamp)
    } else {
        (
            snapshot.animeHistory.map {
                LibraryRowModel(
                    "history-anime-${it.id}",
                    "anime",
                    it.id,
                    it.title,
                    it.titleJapanese ?: "继续观看",
                    it.cover,
                    it.watchedAt,
                )
            } +
                snapshot.mangaHistory.map {
                    LibraryRowModel(
                        "history-manga-${it.id}",
                        "manga",
                        it.id,
                        it.title,
                        "继续阅读第 ${formatChapter(it.chapterNumber)} 话 · 第 ${it.pageIndex + 1} 页",
                        it.coverUrl,
                        it.readAt,
                    )
                }
        ).sortedByDescending(LibraryRowModel::timestamp)
    }

@Composable
fun AccountScreen(
    viewModel: AnimeStreamViewModel,
    onLogin: () -> Unit,
) {
    val session by viewModel.sessionState.collectAsStateWithLifecycle()
    Column(
        modifier =
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        ScreenHeader(title = "我的", subtitle = "网站账号与同步")
        if (!session.ready) {
            Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (session.user == null) {
            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.secondary)
            Text("登录后，收藏、观看历史和漫画阅读位置会与网站账号同步。", style = MaterialTheme.typography.bodyLarge)
            Button(onClick = onLogin, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.Default.Login, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("登录")
            }
        } else {
            Text(
                session.user?.displayName ?: session.user?.username.orEmpty(),
                style = MaterialTheme.typography.headlineMedium,
            )
            Text("@${session.user?.username} · ${session.user?.role}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Sync, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                Spacer(Modifier.width(10.dp))
                Text("此设备正在使用云端书架与进度")
            }
            OutlinedButton(onClick = viewModel::logout, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.Default.Logout, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("退出登录")
            }
        }
    }
}

@Composable
fun LoginScreen(
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
    onSuccess: () -> Unit,
) {
    val session by viewModel.sessionState.collectAsStateWithLifecycle()
    var identity by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var localError by rememberSaveable { mutableStateOf<String?>(null) }
    Column(
        modifier =
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ScreenHeader(title = "登录", subtitle = "使用网站账号", onBack = onBack)
        OutlinedTextField(
            value = identity,
            onValueChange = { identity = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("用户名或邮箱") },
            singleLine = true,
            enabled = !session.busy,
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("密码") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            enabled = !session.busy,
        )
        val error = localError ?: session.error
        if (error != null) Text(error, color = MaterialTheme.colorScheme.error)
        Button(
            onClick = {
                when {
                    identity.isBlank() -> localError = "请输入用户名或邮箱"
                    password.isBlank() -> localError = "请输入密码"
                    else -> {
                        localError = null
                        viewModel.login(identity, password, onSuccess)
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = !session.busy,
        ) {
            if (session.busy) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
                Text("登录")
            }
        }
    }
}

fun formatChapter(number: Double): String = if (number % 1.0 == 0.0) number.toLong().toString() else number.toString().trimEnd('0').trimEnd('.')
