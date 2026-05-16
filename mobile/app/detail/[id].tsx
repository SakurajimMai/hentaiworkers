import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AppState } from '../../components/AppState';
import { colors, radius, shadow, spacing } from '../../constants/theme';
import { normalizeMediaUrl, splitMediaList } from '../../services/media';
import { animeApi } from '../../services/api';
import { favoritesStore } from '../../services/storage';
import { Anime, Tag } from '../../services/types';

function formatYear(anime: Anime) {
  if (anime.releaseYear) return `${anime.releaseYear}`;
  if (anime.releaseDate) return anime.releaseDate.slice(0, 4);
  return '未知';
}

function pickSimilarImage(anime: Anime) {
  const fanart = splitMediaList(anime.fanart);
  return fanart[0] || normalizeMediaUrl(anime.cover);
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const animeId = Number(Array.isArray(id) ? id[0] : id);
  const [anime, setAnime] = useState<Anime | null>(null);
  const [similar, setSimilar] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxListRef = useRef<FlatList<string>>(null);

  const cover = normalizeMediaUrl(anime?.cover);
  const fanartImages = useMemo(() => splitMediaList(anime?.fanart), [anime?.fanart]);
  const stillImages = useMemo(() => {
    const seen = new Set<string>();
    return [cover, ...fanartImages].filter((item): item is string => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }, [cover, fanartImages]);
  const heroImage = stillImages[0] || cover;
  const videoUrl = normalizeMediaUrl(anime?.videoUrl);

  const stillColumns = width >= 600 ? 3 : 2;
  const stillGap = spacing.md;
  const stillSize = useMemo(
    () => (width - spacing.lg * 2 - stillGap * (stillColumns - 1)) / stillColumns,
    [width, stillColumns, stillGap],
  );

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(animeId)) {
      setError('无效的动漫编号');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [detail, similarItems] = await Promise.all([
        animeApi.getAnimeDetail(animeId),
        animeApi.getSimilarAnimes(animeId),
      ]);
      setAnime(detail);
      setSimilar(similarItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : '动漫详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [animeId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useFocusEffect(
    useCallback(() => {
      if (Number.isFinite(animeId)) {
        favoritesStore.has(animeId).then(setFavorited);
      }
    }, [animeId]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const playVideo = () => {
    if (!anime || !videoUrl) return;
    router.push(`/player/${anime.id}`);
  };

  const toggleFavorite = async () => {
    if (!anime) return;
    const next = await favoritesStore.toggle(anime);
    setFavorited(next);
  };

  const openTag = (tag: Tag) => {
    router.push({ pathname: '/discover', params: { tag: String(tag.id), tagName: tag.name } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppState loading title="正在加载详情" description="封面和推荐内容即将准备完成。" />
      </SafeAreaView>
    );
  }

  if (error || !anime) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppState
          title="详情加载失败"
          description={error || '没有找到这部作品。'}
          actionLabel="重试"
          onAction={loadDetail}
        />
      </SafeAreaView>
    );
  }

  const tagSummary =
    anime.tags && anime.tags.length > 0
      ? anime.tags.slice(0, 3).map((t) => t.name).join(' · ')
      : null;
  const meta = [formatYear(anime), '日本', tagSummary].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={videoUrl ? '播放视频' : '查看封面'}
            onPress={playVideo}
            style={styles.heroImageWrap}
          >
            {heroImage ? (
              <Image source={{ uri: heroImage }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={[styles.heroImage, styles.heroFallback]} />
            )}
            <View style={styles.heroGradient} />
            {videoUrl ? (
              <View style={styles.heroPlayDot}>
                <View style={styles.heroPlayTriangle} />
              </View>
            ) : null}
          </Pressable>

          <View style={[styles.heroTopBar, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={goBack}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <Text style={styles.iconBack}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorited ? '取消收藏' : '收藏'}
              onPress={toggleFavorite}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <Text style={[styles.iconHeart, favorited && styles.iconHeartActive]}>♥</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.infoRow}>
            <View style={styles.posterShadow}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.posterFallback]} />
              )}
            </View>
            <View style={styles.infoText}>
              <Text style={styles.title} numberOfLines={2}>{anime.title}</Text>
              {anime.titleJapanese ? (
                <Text style={styles.subtitle} numberOfLines={1}>{anime.titleJapanese}</Text>
              ) : null}
              <Text style={styles.meta} numberOfLines={3}>{meta}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="播放"
              onPress={playVideo}
              disabled={!videoUrl}
              style={({ pressed }) => [
                styles.playButton,
                !videoUrl && styles.playButtonDisabled,
                pressed && styles.playButtonPressed,
              ]}
            >
              <Text style={styles.playTriangleSmall}>▶</Text>
              <Text style={styles.playButtonText}>播放</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorited ? '取消收藏' : '收藏'}
              onPress={toggleFavorite}
              style={({ pressed }) => [
                styles.favButton,
                favorited && styles.favButtonActive,
                pressed && styles.favButtonPressed,
              ]}
            >
              <Text style={[styles.favHeart, favorited && styles.favHeartActive]}>♥</Text>
              <Text style={[styles.favText, favorited && styles.favTextActive]}>
                {favorited ? '已收藏' : '收藏'}
              </Text>
            </Pressable>
          </View>
        </View>

        {anime.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>简介</Text>
            <Text style={styles.description}>{anime.description}</Text>
          </View>
        ) : null}

        {anime.tags && anime.tags.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.tags}>
              {anime.tags.map((tag) => (
                <Pressable
                  key={tag.id}
                  accessibilityRole="button"
                  accessibilityLabel={`浏览 ${tag.name} 标签`}
                  onPress={() => openTag(tag)}
                  style={({ pressed }) => [styles.tag, pressed && styles.tagPressed]}
                >
                  <Text style={styles.tagText}>{tag.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {stillImages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>剧照</Text>
            <View style={styles.stillGrid}>
              {stillImages.map((image, index) => (
                <Pressable
                  key={`${image}-${index}`}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`查看剧照 ${index + 1}`}
                  onPress={() => setLightboxIndex(index)}
                  style={({ pressed }) => [
                    styles.stillItem,
                    {
                      width: stillSize,
                      marginRight: (index + 1) % stillColumns === 0 ? 0 : stillGap,
                    },
                    pressed && styles.stillPressed,
                  ]}
                >
                  <Image source={{ uri: image }} resizeMode="cover" style={styles.stillImage} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {similar.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>推荐</Text>
            {similar.slice(0, 6).map((item) => {
              const preview = pickSimilarImage(item);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`查看 ${item.title}`}
                  onPress={() => router.push(`/detail/${item.id}`)}
                  style={({ pressed }) => [styles.recommendRow, pressed && styles.recommendPressed]}
                >
                  {preview ? (
                    <Image source={{ uri: preview }} style={styles.recommendCover} resizeMode="cover" />
                  ) : (
                    <View style={[styles.recommendCover, styles.recommendFallback]} />
                  )}
                  <View style={styles.recommendBody}>
                    <Text style={styles.recommendTitle} numberOfLines={2}>{item.title}</Text>
                    {item.titleJapanese ? (
                      <Text style={styles.recommendSubtitle} numberOfLines={1}>{item.titleJapanese}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={lightboxIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxIndex(null)}
      >
        <View style={styles.lightbox}>
          <FlatList
            ref={lightboxListRef}
            data={stillImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item}-${index}`}
            initialScrollIndex={lightboxIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / width);
              if (next !== lightboxIndex) setLightboxIndex(next);
            }}
            renderItem={({ item }) => (
              <Pressable style={[styles.lightboxPage, { width }]} onPress={() => setLightboxIndex(null)}>
                <Image source={{ uri: item }} resizeMode="contain" style={styles.lightboxImage} />
              </Pressable>
            )}
          />
          {stillImages.length > 1 && lightboxIndex !== null ? (
            <View pointerEvents="none" style={styles.lightboxCounter}>
              <Text style={styles.lightboxCounterText}>
                {lightboxIndex + 1} / {stillImages.length}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭剧照"
            onPress={() => setLightboxIndex(null)}
            style={({ pressed }) => [styles.lightboxCloseBtn, { top: insets.top + spacing.md }, pressed && styles.lightboxClosePressed]}
          >
            <Text style={styles.lightboxCloseText}>关闭</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  heroWrap: {
    aspectRatio: 16 / 10,
    backgroundColor: colors.surface,
    position: 'relative',
    width: '100%',
  },
  heroImageWrap: {
    flex: 1,
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  heroFallback: {
    backgroundColor: colors.surfaceMuted,
  },
  heroGradient: {
    backgroundColor: 'rgba(10,10,15,0.45)',
    bottom: 0,
    height: '50%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  heroPlayDot: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    height: 64,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -32,
    marginTop: -32,
    position: 'absolute',
    top: '50%',
    width: 64,
  },
  heroPlayTriangle: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 11,
    borderLeftColor: colors.white,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderTopWidth: 11,
    height: 0,
    marginLeft: 4,
    width: 0,
  },
  heroTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonPressed: {
    opacity: 0.74,
  },
  iconBack: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: -2,
  },
  iconHeart: {
    color: colors.white,
    fontSize: 16,
  },
  iconHeartActive: {
    color: colors.primary,
  },
  infoBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  posterShadow: {
    ...shadow,
    borderRadius: radius.md,
  },
  poster: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 132,
    width: 92,
  },
  posterFallback: {
    backgroundColor: colors.surfaceMuted,
  },
  infoText: {
    flex: 1,
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  meta: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
  },
  playButtonDisabled: {
    opacity: 0.5,
  },
  playButtonPressed: {
    opacity: 0.86,
  },
  playTriangleSmall: {
    color: colors.white,
    fontSize: 12,
  },
  playButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  favButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
  },
  favButtonActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  favButtonPressed: {
    opacity: 0.82,
  },
  favHeart: {
    color: colors.textMuted,
    fontSize: 14,
  },
  favHeartActive: {
    color: colors.primary,
  },
  favText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  favTextActive: {
    color: colors.primary,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  tagPressed: {
    opacity: 0.82,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stillItem: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  stillPressed: {
    opacity: 0.84,
  },
  stillImage: {
    height: '100%',
    width: '100%',
  },
  recommendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  recommendPressed: {
    opacity: 0.86,
  },
  recommendCover: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 60,
    width: 80,
  },
  recommendFallback: {
    backgroundColor: colors.surfaceMuted,
  },
  recommendBody: {
    flex: 1,
    gap: 4,
  },
  recommendTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  recommendSubtitle: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  lightbox: {
    backgroundColor: 'rgba(0,0,0,0.96)',
    flex: 1,
  },
  lightboxPage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  lightboxImage: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  lightboxCounter: {
    alignSelf: 'center',
    backgroundColor: 'rgba(8,10,15,0.72)',
    borderRadius: radius.pill,
    bottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  lightboxCounterText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  lightboxCloseBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,10,15,0.72)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  lightboxClosePressed: {
    opacity: 0.82,
  },
  lightboxCloseText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
});
