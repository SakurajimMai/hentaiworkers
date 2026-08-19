import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { colors, radius, spacing } from '../constants/theme';
import { loadAdsConfig } from '../services/ads';
import { API_BASE_URL } from '../services/api';
import { normalizeMediaUrl } from '../services/media';
import { PlayerPauseAd, PlayerPreRollAd } from '../services/types';
import { ARTPLAYER_JS, HLS_JS } from './player-libs';

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
  poster?: string | null;
  fill?: boolean;
}

function embedJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildPlayerHtml(
  videoUrl: string,
  posterUrl: string,
  title: string,
  isHls: boolean,
  preRoll: PlayerPreRollAd,
  pauseAd: PlayerPauseAd,
) {
  const safeUrl = JSON.stringify(videoUrl);
  const safePoster = JSON.stringify(posterUrl || '');
  const safeTitle = JSON.stringify(title || '视频播放');
  const safePre = embedJson(preRoll);
  const safePause = embedJson(pauseAd);

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
.hw-ad{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.92);color:#fff;font-family:system-ui,sans-serif}
.hw-ad.show{display:flex}
.hw-ad-body{max-width:92%;max-height:72%;display:flex;align-items:center;justify-content:center}
.hw-ad-body img,.hw-ad-body video{max-width:100%;max-height:72vh;object-fit:contain}
.hw-ad-body a{color:#fff}
.hw-ad-close,.hw-ad-count{position:absolute;right:14px;top:14px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:12px;padding:7px 12px}
.hw-ad-count{right:auto;left:14px}
</style>
</head>
<body>
<div class="artplayer-app"></div>
<div class="hw-ad" id="hw-ad" hidden>
  <div class="hw-ad-count" id="hw-ad-count"></div>
  <button type="button" class="hw-ad-close" id="hw-ad-close" hidden>关闭广告</button>
  <div class="hw-ad-body" id="hw-ad-body"></div>
</div>
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
    setupAds(art, ${safePre}, ${safePause});
  }catch(e){
    post('error',(e&&e.message)||'初始化失败');
  }

  function setupAds(art, pre, pause){
    var overlay=document.getElementById('hw-ad');
    var body=document.getElementById('hw-ad-body');
    var closeBtn=document.getElementById('hw-ad-close');
    var countEl=document.getElementById('hw-ad-count');
    if(!overlay||!body||!closeBtn||!countEl) return;

    function hasContent(ad){
      return !!(ad && ad.enabled && (String(ad.videoUrl||'').trim() || String(ad.imageUrl||'').trim() || String(ad.html||'').trim()));
    }
    function fill(ad){
      var v=String(ad.videoUrl||'').trim();
      var i=String(ad.imageUrl||'').trim();
      var h=String(ad.html||'').trim();
      var click=String(ad.clickUrl||'').trim();
      body.innerHTML='';
      var node;
      if(v){
        node=document.createElement('video');
        node.src=v;
        node.autoplay=true;
        node.playsInline=true;
        node.loop=true;
        if(ad.muted!==false) node.muted=true;
      }else if(h){
        node=document.createElement('div');
        node.innerHTML=h;
      }else if(i){
        node=document.createElement('img');
        node.src=i;
        node.alt='广告';
      }
      if(!node) return;
      if(click && node.tagName!=='DIV'){
        var a=document.createElement('a');
        a.href=click;
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.appendChild(node);
        body.appendChild(a);
      }else{
        body.appendChild(node);
      }
    }
    function hide(){
      overlay.classList.remove('show');
      overlay.hidden=true;
      closeBtn.hidden=true;
      countEl.textContent='';
      body.innerHTML='';
    }

    var preRollActive=false;
    if(hasContent(pre)){
      preRollActive=true;
      var play=Math.max(0, Math.min(120, Math.floor(Number(pre.playDuration)||0)));
      var total=Math.max(0, Math.min(180, Math.floor(Number(pre.totalDuration)||0)));
      if(total<=0) total=Math.max(play,5);
      if(total<play) total=play;
      var left=total;
      fill(pre);
      overlay.hidden=false;
      overlay.classList.add('show');
      countEl.textContent='广告剩余 '+left+' 秒';
      closeBtn.hidden=play>0;
      closeBtn.textContent=play>0? (play+' 秒后可关闭广告') : '关闭广告';
      var timer=setInterval(function(){
        left-=1;
        if(play>0){
          play-=1;
          if(play<=0){
            closeBtn.hidden=false;
            closeBtn.textContent='关闭广告';
          }else{
            closeBtn.textContent=play+' 秒后可关闭广告';
          }
        }
        countEl.textContent=left>0? ('广告剩余 '+left+' 秒') : '';
        if(left<=0){
          clearInterval(timer);
          preRollActive=false;
          hide();
        }
      },1000);
      closeBtn.onclick=function(){
        if(play>0) return;
        clearInterval(timer);
        preRollActive=false;
        hide();
      };
    }

    if(!hasContent(pause)) return;
    art.on('pause', function(){
      if(preRollActive) return;
      var duration=Number(art.duration)||0;
      var current=Number(art.currentTime)||0;
      if(duration>0 && duration-current<0.35) return;
      fill(pause);
      overlay.hidden=false;
      overlay.classList.add('show');
      countEl.textContent='暂停广告';
      closeBtn.hidden=false;
      closeBtn.textContent='关闭广告';
      closeBtn.onclick=function(){ hide(); };
    });
    art.on('play', hide);
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
  const [preRoll, setPreRoll] = useState<PlayerPreRollAd>({
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    playDuration: 5,
    totalDuration: 10,
    muted: true,
  });
  const [pauseAd, setPauseAd] = useState<PlayerPauseAd>({
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    muted: true,
  });
  const [adsReady, setAdsReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadAdsConfig()
      .then((ads) => {
        if (!live) return;
        setPreRoll(ads.player.preRollAd);
        setPauseAd(ads.player.pauseAd);
      })
      .finally(() => {
        if (live) setAdsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const isHls = useMemo(() => /\.m3u8(\?|$)/i.test(mediaUrl), [mediaUrl]);
  const html = useMemo(
    () =>
      adsReady
        ? buildPlayerHtml(mediaUrl, posterUrl, title || '', isHls, preRoll, pauseAd)
        : '',
    [adsReady, isHls, mediaUrl, pauseAd, posterUrl, preRoll, title],
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
      {html ? (
      <WebView
        key={reloadKey}
        ref={webviewRef}
        source={{ html, baseUrl: API_BASE_URL || 'https://www.ixacg.de' }}
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
