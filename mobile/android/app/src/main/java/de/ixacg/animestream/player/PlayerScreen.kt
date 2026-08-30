package de.ixacg.animestream.player

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.PlayerPauseAd
import de.ixacg.animestream.core.model.PlayerPreRollAd
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.HtmlAd
import de.ixacg.animestream.ui.components.RemoteImage
import kotlinx.coroutines.delay
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    animeId: Long,
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.playerAnime.collectAsStateWithLifecycle()
    val adsState by viewModel.adsState.collectAsStateWithLifecycle()
    val ads = adsState.config
    var preRollAd by remember(animeId) { mutableStateOf<PlayerPreRollAd?>(null) }
    var preRollVisible by remember(animeId) { mutableStateOf(false) }
    var preRollDecided by remember(animeId) { mutableStateOf(false) }
    var pauseAdVisible by remember(animeId) { mutableStateOf(false) }
    var retryToken by remember { mutableIntStateOf(0) }
    var playbackError by remember(animeId) { mutableStateOf<String?>(null) }
    val anime = state.value?.takeIf { it.id == animeId }
    val videoUrl = MediaUrlNormalizer.normalize(anime?.videoUrl)
    val pauseAdAvailable =
        ads.player.pauseAd.enabled &&
            PlayerAdPolicy.hasContent(
                ads.player.pauseAd.videoUrl,
                ads.player.pauseAd.imageUrl,
                ads.player.pauseAd.html,
            )

    ImmersiveLandscapeEffect()
    BackHandler(onBack = onBack)
    LaunchedEffect(viewModel) { viewModel.ensureAdsLoaded() }
    LaunchedEffect(animeId, retryToken) { viewModel.loadPlayer(animeId) }
    LaunchedEffect(animeId, adsState) {
        if (!preRollDecided) {
            when (PlayerAdPolicy.preRollDecision(adsState.ready, ads.player.preRollAd)) {
                PlayerAdPolicy.PreRollDecision.Waiting -> Unit
                PlayerAdPolicy.PreRollDecision.Show -> {
                    preRollAd = ads.player.preRollAd
                    preRollVisible = true
                    preRollDecided = true
                }
                PlayerAdPolicy.PreRollDecision.Skip -> preRollDecided = true
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when {
            state.loading || anime == null && state.error == null ->
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null ->
                PlayerError(state.error.orEmpty(), onRetry = { retryToken++ }, modifier = Modifier.align(Alignment.Center))
            videoUrl == null ->
                PlayerError("没有可播放的媒体地址", onRetry = onBack, modifier = Modifier.align(Alignment.Center))
            else ->
                NativeVideoPlayer(
                    url = videoUrl,
                    instanceToken = retryToken,
                    blocked = !preRollDecided || preRollVisible,
                    onPauseAd = { pauseAdVisible = it && pauseAdAvailable },
                    onError = {
                        pauseAdVisible = false
                        playbackError = it
                    },
                )
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).padding(12.dp).size(48.dp).background(Color(0x88000000)),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回详情", tint = Color.White)
        }

        if (!preRollDecided) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        } else if (preRollVisible && preRollAd != null) {
            PreRollOverlay(ad = requireNotNull(preRollAd), onDismiss = { preRollVisible = false })
        } else if (pauseAdVisible && pauseAdAvailable) {
            PauseAdOverlay(ad = ads.player.pauseAd, onDismiss = { pauseAdVisible = false })
        } else if (playbackError != null) {
            PlayerError(
                message = playbackError.orEmpty(),
                onRetry = {
                    playbackError = null
                    retryToken++
                },
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun NativeVideoPlayer(
    url: String,
    instanceToken: Int,
    blocked: Boolean,
    onPauseAd: (Boolean) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var speed by remember(url) { mutableFloatStateOf(1f) }
    var resizeMode by remember(url) { mutableIntStateOf(AspectRatioFrameLayout.RESIZE_MODE_FIT) }
    var attachedPlayerView by remember { mutableStateOf<PlayerView?>(null) }
    var lifecycleStarted by remember(url, instanceToken) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }
    var pausedByLifecycle by remember(url, instanceToken) { mutableStateOf(false) }
    var resumeAfterLifecycle by remember(url, instanceToken) { mutableStateOf(false) }
    var playbackStarted by remember(url, instanceToken) { mutableStateOf(false) }
    val blockedState by rememberUpdatedState(blocked)
    val pauseAdCallback by rememberUpdatedState(onPauseAd)
    val errorCallback by rememberUpdatedState(onError)
    val player =
        remember(url, instanceToken) {
            val dataSource =
                DefaultHttpDataSource.Factory()
                    .setAllowCrossProtocolRedirects(true)
                    .setDefaultRequestProperties(MediaUrlNormalizer.mediaHeaders())
            ExoPlayer.Builder(context)
                .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(dataSource))
                .build()
                .apply {
                    setMediaItem(MediaItem.fromUri(url))
                    prepare()
                }
        }
    LaunchedEffect(blocked, lifecycleStarted, player) {
        if (blocked || !lifecycleStarted) {
            player.pause()
        } else if (!playbackStarted || resumeAfterLifecycle) {
            resumeAfterLifecycle = false
            player.play()
        }
    }
    DisposableEffect(player, lifecycleOwner) {
        val listener =
            object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (isPlaying) {
                        playbackStarted = true
                        pauseAdCallback(false)
                    } else if (
                        PlayerAdPolicy.shouldShowPauseAd(
                            playbackStarted = playbackStarted,
                            blockedByPreRoll = blockedState,
                            isEnded = player.playbackState == Player.STATE_ENDED,
                            isPlaying = isPlaying,
                            playWhenReady = player.playWhenReady,
                            pausedByLifecycle = pausedByLifecycle,
                        )
                    ) {
                        pauseAdCallback(true)
                    }
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) pauseAdCallback(false)
                }

                override fun onPlayerError(error: PlaybackException) {
                    pauseAdCallback(false)
                    errorCallback(error.localizedMessage ?: "视频播放失败")
                }
            }
        val observer =
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    pausedByLifecycle = false
                    lifecycleStarted = true
                }

                override fun onStop(owner: LifecycleOwner) {
                    resumeAfterLifecycle = player.playWhenReady && !blockedState
                    pausedByLifecycle = true
                    lifecycleStarted = false
                    pauseAdCallback(false)
                    player.pause()
                }
            }
        player.addListener(listener)
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            player.removeListener(listener)
            attachedPlayerView?.player = null
            player.release()
        }
    }
    val playbackPlayer = player
    Box(Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).also { view ->
                    attachedPlayerView = view
                    view.player = playbackPlayer
                    view.useController = true
                    view.controllerShowTimeoutMs = 3_500
                    view.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    view.resizeMode = resizeMode
                }
            },
            update = {
                it.player = playbackPlayer
                it.resizeMode = resizeMode
            },
        )
        Row(
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Surface(color = Color(0xAA000000), shape = MaterialTheme.shapes.small) {
                IconButton(
                    onClick = {
                        speed =
                            when (speed) {
                                1f -> 1.25f
                                1.25f -> 1.5f
                                1.5f -> 2f
                                else -> 1f
                            }
                        player.setPlaybackSpeed(speed)
                    },
                    modifier = Modifier.size(48.dp),
                ) {
                    Text("${speed}x", color = Color.White, style = MaterialTheme.typography.labelMedium)
                }
            }
            Surface(color = Color(0xAA000000), shape = MaterialTheme.shapes.small) {
                IconButton(
                    onClick = {
                        resizeMode =
                            when (resizeMode) {
                                AspectRatioFrameLayout.RESIZE_MODE_FIT -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                                AspectRatioFrameLayout.RESIZE_MODE_FILL -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                                else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                            }
                    },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(Icons.Default.AspectRatio, contentDescription = "切换画面比例", tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun PreRollOverlay(
    ad: PlayerPreRollAd,
    onDismiss: () -> Unit,
) {
    var elapsed by remember(ad) { mutableIntStateOf(0) }
    val timing = remember(ad) { PlayerAdPolicy.normalizePreRollTiming(ad.playDuration, ad.totalDuration) }
    val total = timing.totalDurationSeconds
    val closeAfter = timing.closeDelaySeconds
    LaunchedEffect(ad) {
        while (elapsed < total) {
            delay(1_000)
            elapsed++
        }
        onDismiss()
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AdMedia(
            videoUrl = ad.videoUrl,
            imageUrl = ad.imageUrl,
            html = ad.html,
            clickUrl = ad.clickUrl,
            initiallyMuted = ad.muted,
        )
        Surface(
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
            color = Color(0xCC000000),
            shape = MaterialTheme.shapes.small,
        ) {
            Button(
                onClick = onDismiss,
                enabled = PlayerAdPolicy.canDismissPreRoll(elapsed, closeAfter, total),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(
                    if (PlayerAdPolicy.canDismissPreRoll(elapsed, closeAfter, total)) {
                        "跳过广告"
                    } else {
                        "${closeAfter - elapsed} 秒后可跳过"
                    },
                )
            }
        }
        Text(
            "广告 · ${total - elapsed} 秒",
            color = Color.White,
            modifier = Modifier.align(Alignment.BottomStart).padding(18.dp),
        )
    }
}

@Composable
private fun PauseAdOverlay(
    ad: PlayerPauseAd,
    onDismiss: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color(0xDD000000))) {
        Box(Modifier.fillMaxSize().padding(horizontal = 80.dp, vertical = 28.dp)) {
            AdMedia(
                videoUrl = ad.videoUrl,
                imageUrl = ad.imageUrl,
                html = ad.html,
                clickUrl = ad.clickUrl,
                initiallyMuted = ad.muted,
            )
        }
        IconButton(
            onClick = onDismiss,
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).size(48.dp).background(Color(0xAA000000)),
        ) {
            Icon(Icons.Default.Close, contentDescription = "关闭暂停广告", tint = Color.White)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun AdMedia(
    videoUrl: String,
    imageUrl: String,
    html: String,
    clickUrl: String,
    initiallyMuted: Boolean,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val safeVideo = MediaUrlNormalizer.normalize(videoUrl)
    val safeImage = MediaUrlNormalizer.normalize(imageUrl)
    val safeClick = remember(clickUrl) { clickUrl.trim().toHttpUrlOrNull()?.toString() }
    var muted by remember(videoUrl, imageUrl, html, initiallyMuted) { mutableStateOf(initiallyMuted) }
    Box(
        modifier =
            Modifier.fillMaxSize().clickable(enabled = safeClick != null) {
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safeClick))) }
            },
        contentAlignment = Alignment.Center,
    ) {
        when {
            safeVideo != null -> {
                val player =
                    remember(safeVideo) {
                        val dataSource =
                            DefaultHttpDataSource.Factory()
                                .setAllowCrossProtocolRedirects(true)
                                .setDefaultRequestProperties(MediaUrlNormalizer.mediaHeaders())
                        ExoPlayer.Builder(context)
                            .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(dataSource))
                            .build()
                            .apply {
                                setMediaItem(MediaItem.fromUri(safeVideo))
                                repeatMode = Player.REPEAT_MODE_ONE
                                volume = if (muted) 0f else 1f
                                prepare()
                                playWhenReady = true
                            }
                    }
                LaunchedEffect(muted, player) { player.volume = if (muted) 0f else 1f }
                DisposableEffect(player, lifecycleOwner) {
                    val observer =
                        object : DefaultLifecycleObserver {
                            override fun onStart(owner: LifecycleOwner) {
                                player.play()
                            }

                            override fun onStop(owner: LifecycleOwner) {
                                player.pause()
                            }
                        }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose {
                        lifecycleOwner.lifecycle.removeObserver(observer)
                        player.release()
                    }
                }
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            this.player = player
                            useController = false
                            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        }
                    },
                    update = { it.player = player },
                )
            }
            html.isNotBlank() -> HtmlAd(html, modifier = Modifier.fillMaxSize())
            safeImage != null ->
                RemoteImage(
                    url = safeImage,
                    contentDescription = "广告图片",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            else -> Text("广告", color = Color.White)
        }
        if (safeVideo != null) {
            IconButton(
                onClick = { muted = !muted },
                modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp).size(48.dp).background(Color(0xAA000000)),
            ) {
                Icon(
                    if (muted) Icons.Default.VolumeOff else Icons.Default.VolumeUp,
                    contentDescription = if (muted) "打开广告声音" else "静音广告",
                    tint = Color.White,
                )
            }
        }
        if (safeClick != null) {
            Icon(
                Icons.Default.OpenInBrowser,
                contentDescription = "打开广告链接",
                tint = Color.White,
                modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            )
        }
    }
}

@Composable
private fun PlayerError(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = Color.White)
        Spacer(Modifier.height(12.dp))
        Button(onClick = onRetry) {
            Icon(Icons.Default.Refresh, contentDescription = null)
            Text("重试")
        }
    }
}

@Composable
private fun ImmersiveLandscapeEffect() {
    val context = LocalContext.current
    val activity = context as? Activity ?: return
    DisposableEffect(activity) {
        val originalOrientation = activity.requestedOrientation
        val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            controller.show(WindowInsetsCompat.Type.systemBars())
            activity.requestedOrientation =
                if (originalOrientation == ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) {
                    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                } else {
                    originalOrientation
                }
        }
    }
}
