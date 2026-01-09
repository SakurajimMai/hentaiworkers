import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
}

export default function VideoPlayer({ videoUrl, title }: VideoPlayerProps) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>${title || '视频播放'}</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/artplayer@5/dist/artplayer.css">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          background: #000;
          overflow: hidden;
        }
        #player {
          width: 100vw;
          height: 100vh;
        }
      </style>
    </head>
    <body>
      <div id="player"></div>
      <script src="https://cdn.jsdelivr.net/npm/artplayer@5/dist/artplayer.js"></script>
      <script>
        const art = new Artplayer({
          container: '#player',
          url: '${videoUrl}',
          title: '${title || ''}',
          autoplay: false,
          pip: true,
          fullscreen: true,
          fullscreenWeb: true,
          setting: true,
          playbackRate: true,
          aspectRatio: true,
          screenshot: true,
          hotkey: true,
          mutex: true,
          theme: '#23ade5',
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: width,
    height: 250,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
