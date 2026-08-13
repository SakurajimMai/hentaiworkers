import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../components/AppState';
import { MangaCard } from '../../components/MangaCard';
import { colors, radius, shadow, spacing } from '../../constants/theme';
import { mangaApi } from '../../services/api';
import { normalizeMediaUrl } from '../../services/media';
import { mangaFavoritesStore } from '../../services/storage';
import { MangaDetail, MangaSummary } from '../../services/types';

export default function MangaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mangaId = Number(Array.isArray(id) ? id[0] : id);

  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [related, setRelated] = useState<MangaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(mangaId)) {
      setError('无效的漫画编号');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const detail = await mangaApi.getMangaDetail(mangaId);
      setManga(detail);
      const rec = await mangaApi.getMangaList({
        page: 1,
        limit: 8,
        tag: detail.tags[0],
      });
      const filtered = rec.data.filter((item) => item.id !== detail.id).slice(0, 6);
      if (filtered.length < 3) {
        const latest = await mangaApi.getMangaList({ page: 1, limit: 8 });
        const seen = new Set(filtered.map((item) => item.id));
        for (const item of latest.data) {
          if (item.id === detail.id || seen.has(item.id)) continue;
          filtered.push(item);
          if (filtered.length >= 6) break;
        }
      }
      setRelated(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : '漫画详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [mangaId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useFocusEffect(
    useCallback(() => {
      if (Number.isFinite(mangaId)) {
        mangaFavoritesStore.has(mangaId).then(setFavorited);
      }
    }, [mangaId]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/manga');
  };

  const toggleFavorite = async () => {
    if (!manga) return;
    const next = await mangaFavoritesStore.toggle(manga);
    setFavorited(next);
  };

  const startReading = (chapterNumber?: number) => {
    if (!manga) return;
    const number = chapterNumber ?? manga.chapters[0]?.number;
    if (number == null) return;
    router.push(`/manga-reader/${manga.id}/${number}`);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <AppState loading title="正在加载漫画" />
      </View>
    );
  }

  if (error || !manga) {
    return (
      <View style={styles.screen}>
        <AppState
          title="详情加载失败"
          description={error || '没有找到这部漫画。'}
          actionLabel="重试"
          onAction={loadDetail}
        />
      </View>
    );
  }

  const cover = normalizeMediaUrl(manga.coverUrl);
  const firstChapter = manga.chapters[0]?.number;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={goBack}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorited ? '取消收藏' : '收藏'}
          onPress={toggleFavorite}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={20}
            color={favorited ? colors.primary : colors.text}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
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
              <Text style={styles.title}>{manga.title}</Text>
              {manga.author ? <Text style={styles.subtitle}>作者 {manga.author}</Text> : null}
              <Text style={styles.meta}>
                {[manga.pageCount ? `P${manga.pageCount}` : null, manga.chapterCount > 1 ? `${manga.chapterCount} 话` : null]
                  .filter(Boolean)
                  .join(' · ') || '漫画'}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="开始阅读"
              onPress={() => startReading()}
              disabled={firstChapter == null}
              style={({ pressed }) => [
                styles.readButton,
                firstChapter == null && styles.readButtonDisabled,
                pressed && styles.readButtonPressed,
              ]}
            >
              <Ionicons name="book" size={14} color={colors.white} />
              <Text style={styles.readButtonText}>开始阅读</Text>
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
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={16}
                color={favorited ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.favText, favorited && styles.favTextActive]}>
                {favorited ? '已收藏' : '收藏'}
              </Text>
            </Pressable>
          </View>
        </View>

        {manga.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>简介</Text>
            <Text style={styles.description}>{manga.description.trim()}</Text>
          </View>
        ) : null}

        {manga.tags.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.tags}>
              {manga.tags.map((tag) => (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityLabel={`浏览 ${tag}`}
                  onPress={() => router.push({ pathname: '/manga', params: { tag } })}
                  style={({ pressed }) => [styles.tag, pressed && styles.tagPressed]}
                >
                  <Text style={styles.tagText}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {manga.chapters.length > 1 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>章节</Text>
            <View style={styles.chapterList}>
              {manga.chapters.map((chapter) => (
                <Pressable
                  key={chapter.id}
                  accessibilityRole="button"
                  accessibilityLabel={`阅读第 ${chapter.number} 话`}
                  onPress={() => startReading(chapter.number)}
                  style={({ pressed }) => [styles.chapterRow, pressed && styles.chapterPressed]}
                >
                  <Text style={styles.chapterTitle} numberOfLines={1}>
                    {chapter.title || `第 ${chapter.number} 话`}
                  </Text>
                  <Text style={styles.chapterMeta}>P{chapter.pageCount}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {related.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>推荐内容</Text>
            <View style={styles.relatedGrid}>
              {related.map((item) => (
                <View key={item.id} style={styles.relatedItem}>
                  <MangaCard manga={item} onPress={() => router.push(`/manga-detail/${item.id}`)} />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonPressed: {
    opacity: 0.74,
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
  readButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
  },
  readButtonDisabled: {
    opacity: 0.5,
  },
  readButtonPressed: {
    opacity: 0.86,
  },
  readButtonText: {
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
    justifyContent: 'center',
    minHeight: 32,
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
  chapterList: {
    gap: spacing.sm,
  },
  chapterRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  chapterPressed: {
    opacity: 0.84,
  },
  chapterTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingRight: spacing.md,
  },
  chapterMeta: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  relatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  relatedItem: {
    width: '48%',
  },
});
