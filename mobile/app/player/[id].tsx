import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import VideoPlayer from '../../components/VideoPlayer';
import { AppState } from '../../components/AppState';
import { animeApi } from '../../services/api';
import { normalizeMediaUrl, splitMediaList } from '../../services/media';
import { recordAnimeHistory } from '../../services/library';
import { Anime } from '../../services/types';
import { colors, radius, spacing } from '../../constants/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const animeId = Number(Array.isArray(id) ? id[0] : id);

  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        /* ignore */
      }
      if (!Number.isFinite(animeId)) {
        if (mounted) {
          setError('无效的视频编号');
          setLoading(false);
        }
        return;
      }
      try {
        const detail = await animeApi.getAnimeDetail(animeId);
        if (!mounted) return;
        setAnime(detail);
        await recordAnimeHistory(detail);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [animeId]);

  useEffect(() => {
    const restorePortrait = () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
    const unsub = navigation.addListener('beforeRemove', restorePortrait);
    return () => {
      unsub();
      restorePortrait();
    };
  }, [navigation]);

  const goBack = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    } catch {
      /* ignore */
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const heroImage =
    splitMediaList(anime?.fanart)[0] || normalizeMediaUrl(anime?.cover) || null;
  const videoUrl = normalizeMediaUrl(anime?.videoUrl);

  return (
    <View collapsable={false} style={styles.screen}>
      <StatusBar hidden />
      {loading ? (
        <View style={styles.screen} />
      ) : error || !anime || !videoUrl ? (
        <AppState
          title="无法播放"
          description={error || '该作品当前没有可用的视频源。'}
          actionLabel="返回"
          onAction={goBack}
        />
      ) : (
        <VideoPlayer videoUrl={videoUrl} title={anime.title} poster={heroImage} fill />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        onPress={goBack}
        style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  backBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    left: spacing.lg,
    position: 'absolute',
    top: spacing.md,
    width: 44,
    zIndex: 10,
  },
  backPressed: {
    opacity: 0.78,
  },
});
