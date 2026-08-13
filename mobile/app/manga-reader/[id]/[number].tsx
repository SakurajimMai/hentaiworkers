import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../../components/AppState';
import { colors, radius, spacing } from '../../../constants/theme';
import { mangaApi } from '../../../services/api';
import { normalizeMediaUrl } from '../../../services/media';
import { mangaFavoritesStore, mangaHistoryStore } from '../../../services/storage';
import { MangaChapterDetail, MangaDetail, MangaPage } from '../../../services/types';

function MangaPageImage({ uri, width }: { uri: string; width: number }) {
  const [ratio, setRatio] = useState(2 / 3);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setRatio(w / h);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (failed) {
    return (
      <View style={[styles.pageFallback, { width, height: width * 1.4 }]}>
        <Text style={styles.pageFallbackText}>图片加载失败</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      resizeMode="contain"
      style={{ width, height: width / ratio, backgroundColor: colors.black }}
    />
  );
}

export default function MangaReaderScreen() {
  const { id, number: numberRaw } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const mangaId = Number(Array.isArray(id) ? id[0] : id);
  const chapterNumber = Number(Array.isArray(numberRaw) ? numberRaw[0] : numberRaw);

  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [chapter, setChapter] = useState<MangaChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [favorited, setFavorited] = useState(false);

  const pages = useMemo(
    () =>
      (chapter?.pages ?? [])
        .map((page) => ({ ...page, imageUrl: normalizeMediaUrl(page.imageUrl) || '' }))
        .filter((page) => page.imageUrl),
    [chapter?.pages],
  );

  const chapterIndex = manga?.chapters.findIndex((item) => item.number === chapterNumber) ?? -1;
  const prevChapter = chapterIndex > 0 ? manga?.chapters[chapterIndex - 1] : undefined;
  const nextChapter =
    manga && chapterIndex >= 0 && chapterIndex < manga.chapters.length - 1
      ? manga.chapters[chapterIndex + 1]
      : undefined;

  const loadChapter = useCallback(async () => {
    if (!Number.isFinite(mangaId) || !Number.isFinite(chapterNumber) || chapterNumber < 1) {
      setError('无效的章节');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [detail, payload] = await Promise.all([
        mangaApi.getMangaDetail(mangaId),
        mangaApi.getChapter(mangaId, chapterNumber),
      ]);
      setManga(detail);
      setChapter(payload.chapter);
      await mangaHistoryStore.push(detail, chapterNumber);
      for (const page of payload.chapter.pages.slice(0, 3)) {
        const uri = normalizeMediaUrl(page.imageUrl);
        if (uri) Image.prefetch(uri).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '章节加载失败');
    } finally {
      setLoading(false);
    }
  }, [chapterNumber, mangaId]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

  useEffect(() => {
    if (Number.isFinite(mangaId)) {
      mangaFavoritesStore.has(mangaId).then(setFavorited);
    }
  }, [mangaId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/manga-detail/${mangaId}`);
  };

  const openChapter = (number: number) => {
    router.replace(`/manga-reader/${mangaId}/${number}`);
  };

  const toggleFavorite = async () => {
    if (!manga) return;
    const next = await mangaFavoritesStore.toggle(manga);
    setFavorited(next);
  };

  const renderPage = ({ item, index }: ListRenderItemInfo<MangaPage>) => (
    <Pressable onPress={() => setChromeVisible((v) => !v)}>
      <MangaPageImage uri={item.imageUrl} width={width} />
      {index === pages.length - 1 ? (
        <View style={[styles.endBlock, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.endText}>
            {nextChapter ? '本话结束' : '已经读到最后'}
          </Text>
          <View style={styles.endActions}>
            {prevChapter ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openChapter(prevChapter.number)}
                style={styles.endBtn}
              >
                <Text style={styles.endBtnText}>上一话</Text>
              </Pressable>
            ) : null}
            {nextChapter ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openChapter(nextChapter.number)}
                style={[styles.endBtn, styles.endBtnPrimary]}
              >
                <Text style={styles.endBtnPrimaryText}>下一话</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={goBack} style={[styles.endBtn, styles.endBtnPrimary]}>
                <Text style={styles.endBtnPrimaryText}>返回详情</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" hidden />
        <AppState loading title="正在打开章节" />
      </View>
    );
  }

  if (error || !chapter || !manga) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <AppState
          title="阅读页加载失败"
          description={error || '没有找到这一话。'}
          actionLabel="重试"
          onAction={loadChapter}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" hidden={!chromeVisible} />
      <FlatList
        data={pages}
        keyExtractor={(item) => String(item.index)}
        renderItem={renderPage}
        extraData={chromeVisible}
        showsVerticalScrollIndicator={false}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={4}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.emptyPages}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptyPagesText}>这一话还没有图片</Text>
          </View>
        }
      />

      {chromeVisible ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.topChrome, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={goBack}
              style={styles.chromeBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>
            <View style={styles.chromeTitleWrap}>
              <Text style={styles.chromeTitle} numberOfLines={1}>
                {manga.title}
              </Text>
              <Text style={styles.chromeSub} numberOfLines={1}>
                {chapter.title || `第 ${chapter.number} 话`} · P{chapter.pageCount || pages.length}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorited ? '取消收藏' : '收藏'}
              onPress={toggleFavorite}
              style={styles.chromeBtn}
            >
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={18}
                color={favorited ? colors.primary : colors.white}
              />
            </Pressable>
          </View>
          {prevChapter || nextChapter ? (
            <View style={[styles.bottomChrome, { paddingBottom: insets.bottom + spacing.sm }]}>
              <Pressable
                accessibilityRole="button"
                disabled={!prevChapter}
                onPress={() => prevChapter && openChapter(prevChapter.number)}
                style={[styles.navBtn, !prevChapter && styles.navBtnDisabled]}
              >
                <Text style={styles.navBtnText}>上一话</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!nextChapter}
                onPress={() => nextChapter && openChapter(nextChapter.number)}
                style={[styles.navBtn, !nextChapter && styles.navBtnDisabled]}
              >
                <Text style={styles.navBtnText}>下一话</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  pageFallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  pageFallbackText: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  emptyPages: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: 120,
  },
  emptyPagesText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  topChrome: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chromeBtn: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  chromeTitleWrap: {
    flex: 1,
  },
  chromeTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  chromeSub: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 11,
    marginTop: 2,
  },
  bottomChrome: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  navBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  endBlock: {
    alignItems: 'center',
    backgroundColor: colors.black,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  endText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  endActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  endBtn: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 108,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  endBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  endBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  endBtnPrimaryText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
