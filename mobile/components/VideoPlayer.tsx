import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { colors, radius, spacing } from '../constants/theme';
import { API_BASE_URL } from '../services/api';
import { normalizeMediaUrl } from '../services/media';
import { ARTPLAYER_JS, HLS_JS } from './player-libs';

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
  poster?: string | null;
  fill?: boolean;
}

function buildPlayerHtml(videoUrl: string, posterUrl: string, title: string, isHls: boolean) {
  const safeUrl = JSON.stringify(videoUrl);
  const safePoster = JSON.stringify(posterUrl || '');
  const safeTitle = JSON.stringify(title || '视频播放');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<title>${title || '视频播放'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{position:fixed;inset:0;width:100%;height:100%;background:#000;overflow:hidden;overscroll-behavior:none;touch-action:none;-webkit-tap-highlight-color:transparent}
.artplayer-app{position:fixed;inset:0;width:100%;height:100%;background:#000;overflow:hidden}
.art-fullscreen-web{position:fixed!important;inset:0!important;width:100%!important;height:100%!important}
</style>
</head>
<body>
<div class="artplayer-app"></div>
<script>${isHls ? HLS_JS : ''}</script>
<script>${ARTPLAYER_JS}</script>
<script>
(function(){
  function post(t,p){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:t,payload:p}));}catch(_){}}
  if(typeof Artplayer==='undefined'){post('error','播放器未就绪');return;}

  var url=${safeUrl};
  var poster=${safePoster};
  var title=${safeTitle};
  var isHls=${isHls ? 'true' : 'false'};

  var options={
    container:'.artplayer-app',
    url:url,
    poster:poster||undefined,
    title:title,
    volume:0.7,
    autoplay:false,
    pip:false,
    screenshot:false,
    setting:true,
    playbackRate:true,
    aspectRatio:true,
    fullscreen:false,
    fullscreenWeb:true,
    miniProgressBar:true,
    mutex:true,
    backdrop:true,
    playsInline:true,
    autoOrientation:true,
    lang:'zh-cn',
    theme:'#38BDF8',
    moreVideoAttr:{
      preload:'metadata',
      controlsList:'nodownload',
      'webkit-playsinline':true,
      playsInline:true,
      'x5-video-player-type':'h5',
      'x5-video-player-fullscreen':false
    }
  };

  if(isHls){
    options.type='m3u8';
    options.customType={
      m3u8:function(video,src){
        if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;return;}
        if(typeof Hls==='undefined'||!Hls.isSupported()){video.src=src;return;}
        var hls=new Hls({maxBufferLength:30,enableWorker:true});
        hls.loadSource(src);hls.attachMedia(video);
      }
    };
  }

  try{
    var art=new Artplayer(options);
    art.on('ready',function(){post('ready',null);});
  }catch(e){
    post('error',(e&&e.message)||'初始化失败');
  }
})();
</script>
</body>
</html>`;
}

export default function VideoPlayer({ videoUrl, title, poster, fill }: VideoPlayerProps) {
  const mediaUrl = normalizeMediaUrl(videoUrl) || videoUrl;
  const posterUrl = normalizeMediaUrl(poster) || '';
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isHls = useMemo(() => /\.m3u8(\?|$)/i.test(mediaUrl), [mediaUrl]);
  const html = useMemo(
    () => buildPlayerHtml(mediaUrl, posterUrl, title || '', isHls),
    [mediaUrl, posterUrl, title, isHls],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string; payload?: string };
      if (data.type === 'ready') {
        setLoading(false);
        setErrorMsg(null);
      } else if (data.type === 'error') {
        setLoading(false);
        setErrorMsg(data.payload || '视频加载失败');
      }
    } catch {
      /* ignore */
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <View style={fill ? styles.fillContainer : styles.container}>
      <WebView
        key={reloadKey}
        ref={webviewRef}
        source={{ html, baseUrl: API_BASE_URL || 'http://localhost' }}
        style={styles.webview}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled={false}
        onMessage={onMessage}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />
      {loading && !errorMsg ? (
        <View style={[styles.overlay, { pointerEvents: 'none' }]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.overlayText}>加载播放器中...</Text>
        </View>
      ) : null}
      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>播放失败</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重试播放"
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  fillContainer: {
    backgroundColor: '#000',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.black,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  overlayText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(8, 10, 15, 0.92)',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 280,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryPressed: {
    opacity: 0.82,
  },
  retryText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '800',
  },
});
