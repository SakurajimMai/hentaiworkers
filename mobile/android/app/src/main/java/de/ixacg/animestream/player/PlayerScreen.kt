package de.ixacg.animestream.player

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.net.Uri
import android.view.LayoutInflater
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Brightness6
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
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
import de.ixacg.animestream.R
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.PlayerPauseAd
import de.ixacg.animestream.core.model.PlayerPreRollAd
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.components.HtmlAd
import de.ixacg.animestream.ui.components.RemoteImage
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

private val ScrimTop = Brush.verticalGradient(listOf(Color(0xB3000000), Color.Transparent))
private val ScrimBottom = Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000)))
private val ControlTint = Color(0xFFF1ECE3)
private val ControlMuted = Color(0xFFAAA69F)
private val ControlAccent = Color(0xFFFFB59F)

/** System default screen brightness, restored when the player leaves the screen. */
private const val BRIGHTNESS_SYSTEM_DEFAULT = -1f
private const val BRIGHTNESS_FALLBACK = 0.5f
private const val SEEK_HUD_LINGER_MS = 700L

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    animeId: Long,
    viewModel: AnimeStreamViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.playerAnime.collectAsStateWithLifecycle()
    val resumeMs by viewModel.playerResumeMs.collectAsStateWithLifecycle()
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
            state.loading || anime == null && state.error == null -> LoadingStage(onBack = onBack)
            state.error != null ->
                PlayerFailure(state.error.orEmpty(), onRetry = { retryToken++ }, onBack = onBack)
            videoUrl == null ->
                PlayerFailure(
                    message = "没有可播放的媒体地址",
                    onRetry = onBack,
                    onBack = onBack,
                    retryLabel = "返回详情",
                )
            else ->
                VideoStage(
                    url = videoUrl,
                    title = anime?.title.orEmpty(),
                    instanceToken = retryToken,
                    blocked = !preRollDecided || preRollVisible,
                    chromeEnabled = !preRollVisible && !pauseAdVisible && playbackError == null,
                    resumePositionMs = resumeMs,
                    onBack = onBack,
                    onPauseAd = { pauseAdVisible = it && pauseAdAvailable },
                    onError = {
                        pauseAdVisible = false
                        playbackError = it
                    },
                    onProgress = { positionSeconds, durationSeconds, completed ->
                        viewModel.recordPlaybackProgress(animeId, positionSeconds, durationSeconds, completed)
                    },
                )
        }

        if (!preRollDecided && videoUrl != null) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = ControlAccent)
        } else if (preRollVisible && preRollAd != null) {
            PreRollOverlay(ad = requireNotNull(preRollAd), onDismiss = { preRollVisible = false })
        } else if (pauseAdVisible && pauseAdAvailable) {
            PauseAdOverlay(ad = ads.player.pauseAd, onDismiss = { pauseAdVisible = false })
        } else if (playbackError != null) {
            PlayerFailure(
                message = playbackError.orEmpty(),
                onRetry = {
                    playbackError = null
                    retryToken++
                },
                onBack = onBack,
            )
        }
    }
}

private enum class PlayerHud {
    None,
    Brightness,
    Volume,
    Seek,
}

@OptIn(UnstableApi::class)
@Composable
private fun VideoStage(
    url: String,
    title: String,
    instanceToken: Int,
    blocked: Boolean,
    chromeEnabled: Boolean,
    resumePositionMs: Long,
    onBack: () -> Unit,
    onPauseAd: (Boolean) -> Unit,
    onError: (String) -> Unit,
    onProgress: (Long, Long, Boolean) -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val audioManager = remember(context) { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }

    var speed by remember(url) { mutableFloatStateOf(1f) }
    var fit by remember(url) { mutableStateOf(PlayerUiPolicy.VideoFit.Fit) }
    var controlsVisible by remember(url, instanceToken) { mutableStateOf(true) }
    var locked by remember(url, instanceToken) { mutableStateOf(false) }
    var scrubbing by remember(url, instanceToken) { mutableStateOf(false) }
    var boosting by remember(url, instanceToken) { mutableStateOf(false) }
    var hud by remember(url, instanceToken) { mutableStateOf(PlayerHud.None) }
    var hudLevel by remember(url, instanceToken) { mutableFloatStateOf(0f) }
    var hudText by remember(url, instanceToken) { mutableStateOf("") }
    var positionMs by remember(url, instanceToken) { mutableLongStateOf(0L) }
    var bufferedMs by remember(url, instanceToken) { mutableLongStateOf(0L) }
    var durationMs by remember(url, instanceToken) { mutableLongStateOf(0L) }
    var scrubMs by remember(url, instanceToken) { mutableLongStateOf(0L) }
    var scrubOriginMs by remember(url, instanceToken) { mutableLongStateOf(0L) }
    var isPlaying by remember(url, instanceToken) { mutableStateOf(false) }
    var isBuffering by remember(url, instanceToken) { mutableStateOf(true) }
    var brightnessOverridden by remember(url, instanceToken) { mutableStateOf(false) }

    var attachedPlayerView by remember { mutableStateOf<PlayerView?>(null) }
    var lifecycleStarted by remember(url, instanceToken) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }
    var pausedByLifecycle by remember(url, instanceToken) { mutableStateOf(false) }
    var resumeAfterLifecycle by remember(url, instanceToken) { mutableStateOf(false) }
    var playbackStarted by remember(url, instanceToken) { mutableStateOf(false) }
    val blockedState by rememberUpdatedState(blocked)
    val lockedState by rememberUpdatedState(locked)
    val pauseAdCallback by rememberUpdatedState(onPauseAd)
    val errorCallback by rememberUpdatedState(onError)
    val progressCallback by rememberUpdatedState(onProgress)

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

    fun showSeekHud(text: String) {
        hudText = text
        hud = PlayerHud.Seek
        scope.launch {
            delay(SEEK_HUD_LINGER_MS)
            if (!scrubbing && hud == PlayerHud.Seek) hud = PlayerHud.None
        }
    }

    /** Screen brightness is a window override for this screen only; volume goes to the music stream. */
    fun applyLevel(
        axis: PlayerUiPolicy.DragAxis,
        deltaPx: Float,
        viewportPx: Float,
    ) {
        if (viewportPx <= 0f) return
        when (axis) {
            PlayerUiPolicy.DragAxis.Brightness -> {
                val host = activity ?: return
                val params = host.window.attributes
                val currentLevel = params.screenBrightness.takeIf { it >= 0f } ?: BRIGHTNESS_FALLBACK
                val next = PlayerUiPolicy.adjustLevel(currentLevel, deltaPx, viewportPx)
                params.screenBrightness = next
                host.window.attributes = params
                brightnessOverridden = true
                hudLevel = next
                hud = PlayerHud.Brightness
            }
            PlayerUiPolicy.DragAxis.Volume -> {
                val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                if (max <= 0) return
                val currentLevel = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max
                val next = PlayerUiPolicy.adjustLevel(currentLevel, deltaPx, viewportPx)
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, (next * max).roundToInt(), 0)
                hudLevel = next
                hud = PlayerHud.Volume
            }
            PlayerUiPolicy.DragAxis.Seek -> Unit
        }
    }

    // The resume point arrives after the title, so apply it only while playback is still at the
    // very start; a late answer must never yank a viewer who already seeked somewhere else.
    var resumeApplied by remember(url, instanceToken) { mutableStateOf(false) }
    LaunchedEffect(resumePositionMs, player) {
        if (!resumeApplied && resumePositionMs > 0L && player.currentPosition < 5_000L) {
            resumeApplied = true
            player.seekTo(resumePositionMs)
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

    // A single poll drives the seek bar, both time labels and the buffered track.
    LaunchedEffect(player) {
        while (true) {
            positionMs = player.currentPosition
            bufferedMs = player.bufferedPosition
            durationMs = player.duration.takeIf { it > 0L } ?: 0L
            isPlaying = player.isPlaying
            delay(400)
        }
    }

    // Throttled cloud progress so the website and other devices can resume at the real position.
    LaunchedEffect(player, url) {
        var lastSaved = -PlayerUiPolicy.PROGRESS_SAVE_INTERVAL_MS
        while (true) {
            delay(1_000)
            val current = player.currentPosition
            val total = player.duration.takeIf { it > 0L } ?: 0L
            if (player.isPlaying && PlayerUiPolicy.shouldPersistProgress(current, lastSaved)) {
                lastSaved = current
                progressCallback(current / 1_000L, total / 1_000L, PlayerUiPolicy.isCompleted(current, total))
            }
        }
    }

    LaunchedEffect(controlsVisible, isPlaying, locked, scrubbing) {
        if (controlsVisible && PlayerUiPolicy.shouldAutoHideControls(isPlaying, locked, scrubbing)) {
            delay(PlayerUiPolicy.CONTROLS_AUTO_HIDE_MS)
            controlsVisible = false
        }
    }

    LaunchedEffect(hud, hudLevel) {
        if (hud == PlayerHud.Brightness || hud == PlayerHud.Volume) {
            delay(900)
            hud = PlayerHud.None
        }
    }

    DisposableEffect(player, lifecycleOwner) {
        val listener =
            object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) {
                    isPlaying = playing
                    if (playing) {
                        playbackStarted = true
                        pauseAdCallback(false)
                        return
                    }
                    if (
                        PlayerAdPolicy.shouldShowPauseAd(
                            playbackStarted = playbackStarted,
                            blockedByPreRoll = blockedState,
                            isEnded = player.playbackState == Player.STATE_ENDED,
                            isPlaying = false,
                            playWhenReady = player.playWhenReady,
                            pausedByLifecycle = pausedByLifecycle,
                        )
                    ) {
                        pauseAdCallback(true)
                    }
                    if (playbackStarted) {
                        val current = player.currentPosition
                        val total = player.duration.takeIf { it > 0L } ?: 0L
                        progressCallback(current / 1_000L, total / 1_000L, PlayerUiPolicy.isCompleted(current, total))
                    }
                    if (!lockedState) controlsVisible = true
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    isBuffering = playbackState == Player.STATE_BUFFERING
                    if (playbackState == Player.STATE_ENDED) {
                        pauseAdCallback(false)
                        if (!lockedState) controlsVisible = true
                    }
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
            if (playbackStarted) {
                val current = player.currentPosition
                val total = player.duration.takeIf { it > 0L } ?: 0L
                progressCallback(current / 1_000L, total / 1_000L, PlayerUiPolicy.isCompleted(current, total))
            }
            lifecycleOwner.lifecycle.removeObserver(observer)
            player.removeListener(listener)
            attachedPlayerView?.player = null
            player.release()
            if (brightnessOverridden) {
                activity?.let { host ->
                    val params = host.window.attributes
                    params.screenBrightness = BRIGHTNESS_SYSTEM_DEFAULT
                    host.window.attributes = params
                }
            }
        }
    }

    val resizeMode =
        when (fit) {
            PlayerUiPolicy.VideoFit.Fit -> AspectRatioFrameLayout.RESIZE_MODE_FIT
            PlayerUiPolicy.VideoFit.Fill -> AspectRatioFrameLayout.RESIZE_MODE_FILL
            PlayerUiPolicy.VideoFit.Crop -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        }
    val playbackPlayer = player

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                // Inflated rather than constructed: surface_type is an XML-only attribute, and a
                // TextureView is what keeps the last frame from surviving the rotation home.
                val view = LayoutInflater.from(ctx).inflate(R.layout.player_surface, null) as PlayerView
                attachedPlayerView = view
                view.player = playbackPlayer
                view.resizeMode = resizeMode
                view
            },
            update = { view ->
                view.player = playbackPlayer
                view.resizeMode = resizeMode
                // Bound to the view, so the flag is dropped automatically when it detaches.
                view.keepScreenOn = isPlaying
            },
        )

        PlayerGestureLayer(
            enabled = chromeEnabled,
            locked = locked,
            widthPx = widthPx,
            heightPx = heightPx,
            onToggleControls = { controlsVisible = !controlsVisible },
            onZoneTap = { zone ->
                when (zone) {
                    PlayerUiPolicy.TapZone.Rewind -> {
                        player.seekTo(
                            PlayerUiPolicy.seekBy(player.currentPosition, -PlayerUiPolicy.SEEK_STEP_MS, durationMs),
                        )
                        showSeekHud("-10 秒")
                    }
                    PlayerUiPolicy.TapZone.Forward -> {
                        player.seekTo(
                            PlayerUiPolicy.seekBy(player.currentPosition, PlayerUiPolicy.SEEK_STEP_MS, durationMs),
                        )
                        showSeekHud("+10 秒")
                    }
                    PlayerUiPolicy.TapZone.Toggle -> if (player.isPlaying) player.pause() else player.play()
                }
            },
            onBoostChange = { active ->
                if (active) {
                    boosting = true
                    player.setPlaybackSpeed(PlayerUiPolicy.BOOST_SPEED)
                } else if (boosting) {
                    boosting = false
                    player.setPlaybackSpeed(speed)
                }
            },
            onScrubStart = {
                scrubbing = true
                controlsVisible = true
                scrubOriginMs = player.currentPosition
            },
            onScrubDelta = { dragPx ->
                scrubMs = PlayerUiPolicy.scrubPosition(scrubOriginMs, dragPx, widthPx, durationMs)
                hudText = PlayerUiPolicy.formatTime(scrubMs)
                hud = PlayerHud.Seek
            },
            onScrubEnd = {
                if (scrubbing) player.seekTo(scrubMs)
                scrubbing = false
                if (hud == PlayerHud.Seek) hud = PlayerHud.None
            },
            onLevelDelta = { axis, deltaPx -> applyLevel(axis, deltaPx, heightPx) },
        )

        if (isBuffering && !scrubbing) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = ControlAccent)
        }

        if (boosting) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(top = 56.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xCC000000))
                        .padding(horizontal = 14.dp, vertical = 6.dp),
            ) {
                Text(
                    "${PlayerUiPolicy.speedLabel(PlayerUiPolicy.BOOST_SPEED)} 倍速播放中",
                    color = ControlTint,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }

        HudOverlay(hud = hud, level = hudLevel, text = hudText, modifier = Modifier.align(Alignment.Center))

        AnimatedVisibility(
            visible = chromeEnabled && controlsVisible && !locked,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            PlayerChrome(
                title = title,
                positionMs = if (scrubbing) scrubMs else positionMs,
                bufferedMs = bufferedMs,
                durationMs = durationMs,
                isPlaying = isPlaying,
                speed = speed,
                fit = fit,
                onBack = onBack,
                onToggle = {
                    if (player.isPlaying) player.pause() else player.play()
                    controlsVisible = true
                },
                onSeekBy = { delta ->
                    player.seekTo(PlayerUiPolicy.seekBy(player.currentPosition, delta, durationMs))
                    controlsVisible = true
                },
                onScrubStart = { scrubbing = true },
                onScrub = { fraction -> scrubMs = PlayerUiPolicy.positionForFraction(fraction, durationMs) },
                onScrubEnd = {
                    player.seekTo(scrubMs)
                    scrubbing = false
                },
                onSpeed = {
                    val next = PlayerUiPolicy.nextSpeed(speed)
                    speed = next
                    player.setPlaybackSpeed(next)
                    controlsVisible = true
                },
                onFit = {
                    fit = PlayerUiPolicy.nextFit(fit)
                    controlsVisible = true
                },
                onLock = {
                    locked = true
                    controlsVisible = false
                },
            )
        }

        AnimatedVisibility(
            visible = chromeEnabled && locked && controlsVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier =
                Modifier
                    .align(Alignment.CenterStart)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(start = 12.dp),
        ) {
            CircleControl(
                onClick = {
                    locked = false
                    controlsVisible = true
                },
                contentDescription = "解除锁定",
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = ControlTint)
            }
        }
    }
}

@Composable
private fun PlayerChrome(
    title: String,
    positionMs: Long,
    bufferedMs: Long,
    durationMs: Long,
    isPlaying: Boolean,
    speed: Float,
    fit: PlayerUiPolicy.VideoFit,
    onBack: () -> Unit,
    onToggle: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onScrubStart: () -> Unit,
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    onSpeed: () -> Unit,
    onFit: () -> Unit,
    onLock: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(132.dp).background(ScrimTop))
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(158.dp).background(ScrimBottom))

        Row(
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircleControl(onClick = onBack, contentDescription = "返回详情") {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = ControlTint)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                title,
                color = ControlTint,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            CircleControl(onClick = onLock, contentDescription = "锁定屏幕") {
                Icon(Icons.Default.LockOpen, contentDescription = null, tint = ControlTint)
            }
        }

        Row(
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(30.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircleControl(onClick = { onSeekBy(-PlayerUiPolicy.SEEK_STEP_MS) }, contentDescription = "后退 10 秒") {
                Icon(Icons.Default.Replay10, contentDescription = null, tint = ControlTint)
            }
            Box(
                modifier =
                    Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(Color(0x4DFFFFFF))
                        .clickable(onClick = onToggle)
                        .semantics { contentDescription = if (isPlaying) "暂停" else "播放" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = ControlTint,
                    modifier = Modifier.size(34.dp),
                )
            }
            CircleControl(onClick = { onSeekBy(PlayerUiPolicy.SEEK_STEP_MS) }, contentDescription = "前进 10 秒") {
                Icon(Icons.Default.Forward10, contentDescription = null, tint = ControlTint)
            }
        }

        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    PlayerUiPolicy.formatTime(positionMs),
                    color = ControlTint,
                    style = MaterialTheme.typography.labelMedium,
                )
                Box(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                    SeekBar(
                        positionMs = positionMs,
                        bufferedMs = bufferedMs,
                        durationMs = durationMs,
                        onScrubStart = onScrubStart,
                        onScrub = onScrub,
                        onScrubEnd = onScrubEnd,
                    )
                }
                Text(
                    PlayerUiPolicy.formatTime(durationMs),
                    color = ControlMuted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ChromeChip(
                    text = PlayerUiPolicy.speedLabel(speed),
                    contentDescription = "切换倍速，当前 ${PlayerUiPolicy.speedLabel(speed)}",
                    onClick = onSpeed,
                )
                Spacer(Modifier.width(8.dp))
                ChromeChip(
                    text = PlayerUiPolicy.fitLabel(fit),
                    contentDescription = "切换画面比例，当前 ${PlayerUiPolicy.fitLabel(fit)}",
                    onClick = onFit,
                    leading = {
                        Icon(
                            Icons.Default.AspectRatio,
                            contentDescription = null,
                            tint = ControlTint,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun SeekBar(
    positionMs: Long,
    bufferedMs: Long,
    durationMs: Long,
    onScrubStart: () -> Unit,
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
) {
    val fraction = PlayerUiPolicy.progressFraction(positionMs, durationMs)
    val buffered = PlayerUiPolicy.progressFraction(bufferedMs, durationMs)
    Box(contentAlignment = Alignment.CenterStart) {
        if (buffered > 0f) {
            Box(
                Modifier
                    .fillMaxWidth(buffered)
                    .height(3.dp)
                    .padding(horizontal = 2.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x59FFFFFF)),
            )
        }
        Slider(
            value = fraction,
            onValueChange = {
                onScrubStart()
                onScrub(it)
            },
            onValueChangeFinished = onScrubEnd,
            enabled = durationMs > 0L,
            colors =
                SliderDefaults.colors(
                    thumbColor = ControlAccent,
                    activeTrackColor = ControlAccent,
                    inactiveTrackColor = Color(0x33FFFFFF),
                ),
            modifier = Modifier.fillMaxWidth().height(26.dp).semantics { contentDescription = "播放进度" },
        )
    }
}

@Composable
private fun ChromeChip(
    text: String,
    contentDescription: String,
    onClick: () -> Unit,
    leading: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0x4D000000))
                .clickable(onClick = onClick)
                .semantics { this.contentDescription = contentDescription }
                .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading?.invoke()
        Text(text, color = ControlTint, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun CircleControl(
    onClick: () -> Unit,
    contentDescription: String,
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color(0x33000000))
                .clickable(onClick = onClick)
                .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun HudOverlay(
    hud: PlayerHud,
    level: Float,
    text: String,
    modifier: Modifier = Modifier,
) {
    if (hud == PlayerHud.None) return
    Row(
        modifier =
            modifier
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xCC000000))
                .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when (hud) {
            PlayerHud.Brightness -> Icon(Icons.Default.Brightness6, contentDescription = null, tint = ControlTint)
            PlayerHud.Volume ->
                Icon(
                    if (level <= 0f) Icons.Default.VolumeOff else Icons.Default.VolumeUp,
                    contentDescription = null,
                    tint = ControlTint,
                )
            else -> Unit
        }
        Text(
            if (hud == PlayerHud.Seek) text else "${(level * 100).roundToInt()}%",
            color = ControlTint,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

@Composable
private fun LoadingStage(onBack: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = ControlAccent)
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(8.dp),
        ) {
            CircleControl(onClick = onBack, contentDescription = "返回详情") {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = ControlTint)
            }
        }
    }
}

@Composable
private fun PlayerFailure(
    message: String,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    retryLabel: String = "重试",
) {
    Box(Modifier.fillMaxSize().background(Color(0xE6000000))) {
        Column(
            modifier = Modifier.align(Alignment.Center).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(message, color = ControlTint, style = MaterialTheme.typography.titleMedium)
            Button(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(retryLabel)
            }
        }
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(8.dp),
        ) {
            CircleControl(onClick = onBack, contentDescription = "返回详情") {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = ControlTint)
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
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(12.dp),
        ) {
            Button(
                onClick = onDismiss,
                enabled = PlayerAdPolicy.canDismissPreRoll(elapsed, closeAfter, total),
                modifier = Modifier.heightIn(min = 44.dp),
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
        Box(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(14.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x99000000))
                    .padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            Text("广告 · ${total - elapsed} 秒", color = ControlTint, style = MaterialTheme.typography.labelMedium)
        }
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
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(12.dp),
        ) {
            CircleControl(onClick = onDismiss, contentDescription = "关闭暂停广告") {
                Icon(Icons.Default.Close, contentDescription = null, tint = ControlTint)
            }
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
            html.isNotBlank() -> HtmlAd(html, modifier = Modifier.fillMaxSize(), clickUrl = safeClick.orEmpty())
            safeImage != null ->
                RemoteImage(
                    url = safeImage,
                    contentDescription = "广告图片",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            else -> Text("广告", color = ControlTint)
        }
        if (safeVideo != null) {
            Box(modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp)) {
                CircleControl(
                    onClick = { muted = !muted },
                    contentDescription = if (muted) "打开广告声音" else "静音广告",
                ) {
                    Icon(
                        if (muted) Icons.Default.VolumeOff else Icons.Default.VolumeUp,
                        contentDescription = null,
                        tint = ControlTint,
                    )
                }
            }
        }
        if (safeClick != null) {
            Icon(
                Icons.Default.OpenInBrowser,
                contentDescription = "打开广告链接",
                tint = ControlTint,
                modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            )
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
