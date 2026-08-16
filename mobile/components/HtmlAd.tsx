import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { API_BASE_URL } from '../services/api';

function wrapHtml(html: string, dark: boolean) {
  const bg = dark ? '#0A0A0F' : 'transparent';
  const fg = dark ? '#FAFAFA' : '#111';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:${bg};color:${fg};font-family:system-ui,-apple-system,sans-serif}
  body{padding:0}
  img,video,iframe{max-width:100%;height:auto;display:block;border:0}
  a{color:#A855F7}
</style>
</head>
<body>${html}
<script>
(function(){
  function report(){
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'h', h:h}));
    }
  }
  window.addEventListener('load', report);
  setTimeout(report, 80);
  setTimeout(report, 400);
  setTimeout(report, 1200);
})();
</script>
</body>
</html>`;
}

function shouldOpenExternally(url: string) {
  return /^(https?:|mailto:|intent:)/i.test(url);
}

export function HtmlAd({
  html,
  minHeight = 72,
  maxHeight = 280,
  dark = false,
  fill = false,
}: {
  html: string;
  minHeight?: number;
  maxHeight?: number;
  dark?: boolean;
  fill?: boolean;
}) {
  const sourceHtml = useMemo(() => wrapHtml(html, dark), [dark, html]);
  const [height, setHeight] = useState(minHeight);

  const onNav = (req: WebViewNavigation) => {
    const url = req.url || '';
    if (
      url.startsWith('about:') ||
      url.startsWith('data:') ||
      url.startsWith('file:')
    ) {
      return true;
    }
    if (req.navigationType === 'click' && shouldOpenExternally(url)) {
      Linking.openURL(url).catch(() => undefined);
      return false;
    }
    return true;
  };

  if (Platform.OS === 'web') {
    return (
      <View style={fill ? styles.fill : { minHeight, height }}>
        {React.createElement('iframe', {
          title: '广告',
          srcDoc: sourceHtml,
          style: {
            width: '100%',
            height: fill ? '100%' : height,
            borderWidth: 0,
            backgroundColor: 'transparent',
          },
        })}
      </View>
    );
  }

  return (
    <View style={fill ? styles.fill : { height: fill ? undefined : Math.min(maxHeight, Math.max(minHeight, height)) }}>
      <WebView
        source={{ html: sourceHtml, baseUrl: API_BASE_URL || 'https://www.ixacg.de' }}
        style={fill ? styles.fillWeb : { height: Math.min(maxHeight, Math.max(minHeight, height)), backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onShouldStartLoadWithRequest={onNav}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as { type?: string; h?: number };
            if (data.type === 'h' && Number.isFinite(data.h) && (data.h as number) > 0) {
              setHeight(Math.ceil(data.h as number));
            }
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: 'hidden',
  },
  fillWeb: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});
