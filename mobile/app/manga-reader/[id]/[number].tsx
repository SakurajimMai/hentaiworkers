import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../../components/AppState';
import { HtmlAd } from '../../../components/HtmlAd';
import { PageScrubber } from '../../../components/PageScrubber';
import { RemoteImage } from '../../../components/RemoteImage';
import { ZoomableReader } from '../../../components/ZoomableReader';
import { colors, radius, spacing, virtualizedListProps } from '../../../constants/theme';
import { readerAdHtml, useAdsConfig } from '../../../services/ads';
import { mangaApi } from '../../../services/api';
import { isMangaFavorite, recordMangaHistory, toggleMangaFavorite } from '../../../services/library';
import { normalizeMediaUrl } from '../../../services/media';
import { MangaChapterDetail, MangaDetail, MangaPage } from '../../../services/types';

function MangaPageImage({ uri, width }: { uri: string; width: number }) {
  const [ratio, setRatio] = useState(2 / 3);

  return (
    <RemoteImage
      source={{ uri }}
      resizeMode="contain"
      onLoad={(event) => {
        const src = event.nativeEvent.source;
        if (src?.width > 0 && src?.height > 0) setRatio(src.width / src.height);
      }}
      style={{ width, height: width / ratio, backgroundColor: 'transparent' }}
    />
  );
}

export default function MangaReaderScreen() {
  const { id, number: numberRaw } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<MangaPage>>(null);

  const mangaId = Number(Array.isArray(id) ? id[0] : id);
  const chapterNumber = Number(Array.isArray(numberRaw) ? numberRaw[0] : numberRaw);

  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [chapter, setChapter] = useState<MangaChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(false);
  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const didScroll = useRef(false);
  const [favorited, setFavorited] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const ads = useAdsConfig();
  const topHtml = readerAdHtml(ads.reader.top);
  const bottomHtml = readerAdHtml(ads.reader.bottom);

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
      setPageIndex(0);
      await recordMangaHistory(detail, chapterNumber, 0);
      for (const page of payload.chapter.pages.slice(0, 4)) {
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
      isMangaFavorite(mangaId).then(setFavorited);
    }
  }, [mangaId]);

  useEffect(() => {
    if (!manga || !pages.length) return;
    const timer = setTimeout(() => {
      recordMangaHistory(manga, chapterNumber, pageIndex).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [chapterNumber, manga, pageIndex, pages.length]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/manga-detail/${mangaId}`);
  };

  const openChapter = (number: number) => {
    setChaptersOpen(false);
    router.replace(`/manga-reader/${mangaId}/${number}`);
  };

  const toggleFavorite = async () => {
    if (!manga) return;
    const next = await toggleMangaFavorite(manga);
    setFavorited(next);
  };

  const goPage = (next: number) => {
    if (!pages.length) return;
    if (next < 0) {
      if (prevChapter) openChapter(prevChapter.number);
      return;
    }
    if (next >= pages.length) {
      if (nextChapter) openChapter(nextChapter.number);
      return;
    }
    setPageIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0 });
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    didScroll.current = false;
    touchStart.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      t: Date.now(),
    };
  };

  const onTouchEnd = (event: GestureResponderEvent) => {
    if (zoomed) return;
    const dt = Date.now() - touchStart.current.t;
    const dx = Math.abs(event.nativeEvent.pageX - touchStart.current.x);
    const dy = Math.abs(event.nativeEvent.pageY - touchStart.current.y);
    if (!didScroll.current && dt < 280 && dx < 12 && dy < 12) {
      setChromeVisible((value) => !value);
    }
  };

  const onScrollBeginDrag = () => {
    didScroll.current = true;
    if (chromeVisible) setChromeVisible(false);
  };

  const onMomentumScrollEnd = (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
    didScroll.current = false;
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (typeof first?.index === 'number') setPageIndex(first.index);
  }).current;

  const renderPage = ({ item }: ListRenderItemInfo<MangaPage>) => (
    <View style={{ width }}>
      <MangaPageImage uri={item.imageUrl} width={width} />
    </View>
  );

  if (loading) {
    return (
      <View collapsable={false} style={styles.screen}>
        <StatusBar style="light" hidden />
        <AppState loading title="正在打开章节" />
      </View>
    );
  }

  if (error || !chapter || !manga) {
    return (
      <View collapsable={false} style={styles.screen}>
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
    <View collapsable={false} style={styles.screen}>
      <StatusBar style="light" hidden={!chromeVisible} />
      <ZoomableReader onZoomChange={setZoomed}>
        <FlatList
          ref={listRef}
          data={pages}
          keyExtractor={(item) => String(item.index)}
          renderItem={renderPage}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!zoomed}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
          {...virtualizedListProps}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          overScrollMode="never"
          windowSize={8}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 80);
          }}
          ListHeaderComponent={
            topHtml ? (
              <View style={styles.readerAd} accessibilityLabel="章节顶部广告">
                <HtmlAd html={topHtml} dark minHeight={72} maxHeight={240} />
              </View>
            ) : null
          }
          ListFooterComponent={
            <View style={{ paddingBottom: insets.bottom + 96 }}>
              {bottomHtml ? (
                <View style={styles.readerAd}>
                  <HtmlAd html={bottomHtml} dark minHeight={72} maxHeight={240} />
                </View>
              ) : null}
              <Text style={styles.endText}>
                {nextChapter ? '本话结束，打开菜单进入下一话' : '已经读到最后'}
              </Text>
            </View>
          }
        />
      </ZoomableReader>

      {chromeVisible ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.topChrome, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable onPress={goBack} style={styles.chromeBtn} accessibilityLabel="返回">
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => setChaptersOpen(true)} style={styles.chromeTitleWrap}>
              <Text style={styles.chromeTitle} numberOfLines={1}>
                {manga.title}
              </Text>
              <Text style={styles.chromeSub} numberOfLines={1}>
                {chapter.title || `第 ${chapter.number} 话`}
              </Text>
            </Pressable>
            <Pressable onPress={toggleFavorite} style={styles.chromeBtn}>
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={18}
                color={favorited ? colors.primary : colors.white}
              />
            </Pressable>
            <Pressable onPress={() => setChaptersOpen(true)} style={styles.chromeBtn} accessibilityLabel="目录">
              <Ionicons name="list-outline" size={18} color={colors.white} />
            </Pressable>
          </View>
          <View style={[styles.scrubberBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <View style={styles.scrubberRow}>
              <Pressable
                disabled={!prevChapter}
                onPress={() => prevChapter && openChapter(prevChapter.number)}
                style={[styles.edgeBtn, !prevChapter && styles.edgeBtnDisabled]}
              >
                <Text style={styles.edgeBtnText}>上一话</Text>
              </Pressable>
              <View style={styles.scrubberGrow}>
                <PageScrubber index={pageIndex} total={pages.length} onSeek={goPage} />
              </View>
              <Pressable
                disabled={!nextChapter}
                onPress={() => nextChapter && openChapter(nextChapter.number)}
                style={[styles.edgeBtn, !nextChapter && styles.edgeBtnDisabled]}
              >
                <Text style={styles.edgeBtnText}>下一话</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Modal visible={chaptersOpen} transparent animationType="fade" onRequestClose={() => setChaptersOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setChaptersOpen(false)}>
          <Pressable style={[styles.sheet, { maxHeight: height * 0.7 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>目录</Text>
            <FlatList
              data={manga.chapters}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openChapter(item.number)}
                  style={[styles.chapterRow, item.number === chapterNumber && styles.chapterRowOn]}
                >
                  <Text
                    style={[styles.chapterText, item.number === chapterNumber && styles.chapterTextOn]}
                    numberOfLines={1}
                  >
                    {item.title || `第 ${item.number} 话`}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.black, flex: 1 },
  readerAd: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  pageFallback: { alignItems: 'center', backgroundColor: colors.surfaceMuted, justifyContent: 'center' },
  pageFallbackText: { color: colors.textSubtle, fontSize: 13 },
  endText: { color: colors.white, fontSize: 13, paddingVertical: spacing.lg, textAlign: 'center' },
  topChrome: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chromeBtn: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  chromeTitleWrap: { flex: 1 },
  chromeTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  chromeSub: { color: 'rgba(255,255,255,0.68)', fontSize: 11, marginTop: 2 },
  scrubberBar: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    bottom: 0,
    left: 0,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  scrubberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  scrubberGrow: { flex: 1 },
  edgeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  edgeBtnDisabled: { opacity: 0.3 },
  edgeBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  modalBg: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  chapterRow: { paddingVertical: 10 },
  chapterRowOn: { opacity: 1 },
  chapterText: { color: colors.text, fontSize: 14 },
  chapterTextOn: { color: colors.primary, fontWeight: '800' },
});
