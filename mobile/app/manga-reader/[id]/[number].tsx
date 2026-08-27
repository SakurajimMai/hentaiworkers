import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ListRenderItemInfo,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from '../../../components/AppState';
import { HtmlAd } from '../../../components/HtmlAd';
import { RemoteImage } from '../../../components/RemoteImage';
import { colors, radius, spacing, virtualizedListProps } from '../../../constants/theme';
import { readerAdHtml, useAdsConfig } from '../../../services/ads';
import { mangaApi } from '../../../services/api';
import { normalizeMediaUrl } from '../../../services/media';
import { mangaFavoritesStore, mangaHistoryStore } from '../../../services/storage';
import { MangaChapterDetail, MangaDetail, MangaPage } from '../../../services/types';

const SETTINGS_KEY = '@manga/reader-settings';

type ReaderMode = 'webtoon' | 'paged';
type ReaderBg = 'black' | 'gray' | 'white';
type ReaderSettings = { mode: ReaderMode; rtl: boolean; bg: ReaderBg; brightness: number };

const DEFAULT_SETTINGS: ReaderSettings = { mode: 'webtoon', rtl: false, bg: 'black', brightness: 0 };

const BG_COLOR: Record<ReaderBg, string> = {
  black: '#000000',
  gray: '#1C1C1C',
  white: '#F4F4F5',
};

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
    <RemoteImage
      source={{ uri }}
      resizeMode="contain"
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
  const scrollOffset = useRef(0);

  const mangaId = Number(Array.isArray(id) ? id[0] : id);
  const chapterNumber = Number(Array.isArray(numberRaw) ? numberRaw[0] : numberRaw);

  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [chapter, setChapter] = useState<MangaChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const ads = useAdsConfig();
  const topHtml = readerAdHtml(ads.reader.top);
  const bottomHtml = readerAdHtml(ads.reader.bottom);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      })
      .catch(() => undefined);
  }, []);

  const saveSettings = (next: ReaderSettings) => {
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  };

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
      await mangaHistoryStore.push(detail, chapterNumber);
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
      mangaFavoritesStore.has(mangaId).then(setFavorited);
    }
  }, [mangaId]);

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
    const next = await mangaFavoritesStore.toggle(manga);
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
    if (settings.mode === 'paged') {
      listRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      listRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0 });
    }
  };

  const handleTap = (x: number) => {
    if (x < width / 3) {
      goPage(settings.rtl ? pageIndex + 1 : pageIndex - 1);
    } else if (x > (width * 2) / 3) {
      goPage(settings.rtl ? pageIndex - 1 : pageIndex + 1);
    } else {
      setChromeVisible((v) => !v);
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset;
    if (settings.mode === 'paged') {
      const idx = Math.round((settings.rtl ? -offset.x : offset.x) / Math.max(width, 1));
      if (idx >= 0 && idx < pages.length) setPageIndex(idx);
    } else {
      scrollOffset.current = offset.y;
      const approx = Math.min(
        pages.length - 1,
        Math.max(0, Math.floor(offset.y / Math.max(height * 0.8, 1))),
      );
      setPageIndex(approx);
    }
  };

  const renderPage = ({ item }: ListRenderItemInfo<MangaPage>) => (
    <Pressable onPress={(e) => handleTap(e.nativeEvent.locationX)} style={{ width }}>
      <MangaPageImage uri={item.imageUrl} width={width} />
    </Pressable>
  );

  const bg = BG_COLOR[settings.bg];
  const fg = settings.bg === 'white' ? '#111' : colors.white;

  if (loading) {
    return (
      <View collapsable={false} style={[styles.screen, { backgroundColor: bg }]}>
        <StatusBar style="light" hidden />
        <AppState loading title="正在打开章节" />
      </View>
    );
  }

  if (error || !chapter || !manga) {
    return (
      <View collapsable={false} style={[styles.screen, { backgroundColor: bg }]}>
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
    <View collapsable={false} style={[styles.screen, { backgroundColor: bg }]}>
      <StatusBar style={settings.bg === 'white' ? 'dark' : 'light'} hidden={!chromeVisible} />
      <FlatList
        ref={listRef}
        data={pages}
        key={settings.mode + String(settings.rtl)}
        horizontal={settings.mode === 'paged'}
        pagingEnabled={settings.mode === 'paged'}
        inverted={settings.mode === 'paged' && settings.rtl}
        keyExtractor={(item) => String(item.index)}
        renderItem={renderPage}
        extraData={chromeVisible}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        {...virtualizedListProps}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        overScrollMode="never"
        windowSize={8}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 80);
        }}
        ListHeaderComponent={
          settings.mode === 'webtoon' && topHtml ? (
            <View style={styles.readerAd} accessibilityLabel="章节顶部广告">
              <HtmlAd html={topHtml} dark minHeight={72} maxHeight={240} />
            </View>
          ) : null
        }
        ListFooterComponent={
          settings.mode === 'webtoon' ? (
            <View style={{ paddingBottom: insets.bottom + spacing.xl }}>
              {bottomHtml ? (
                <View style={styles.readerAd}>
                  <HtmlAd html={bottomHtml} dark minHeight={72} maxHeight={240} />
                </View>
              ) : null}
              <Text style={[styles.endText, { color: fg }]}>
                {nextChapter ? '本话结束，点右侧进入下一话' : '已经读到最后'}
              </Text>
            </View>
          ) : null
        }
      />

      {settings.brightness > 0 ? (
        <View pointerEvents="none" style={[styles.dim, { opacity: settings.brightness }]} />
      ) : null}

      <Text style={[styles.pageHud, { bottom: insets.bottom + 8, color: fg }]}>
        {Math.min(pageIndex + 1, pages.length)} / {pages.length}
      </Text>

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
                {chapter.title || `第 ${chapter.number} 话`} · {pageIndex + 1}/{pages.length}
              </Text>
            </Pressable>
            <Pressable onPress={toggleFavorite} style={styles.chromeBtn}>
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={18}
                color={favorited ? colors.primary : colors.white}
              />
            </Pressable>
            <Pressable onPress={() => setSettingsOpen(true)} style={styles.chromeBtn} accessibilityLabel="阅读设置">
              <Ionicons name="options-outline" size={18} color={colors.white} />
            </Pressable>
          </View>
          <View style={[styles.bottomChrome, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              disabled={!prevChapter}
              onPress={() => prevChapter && openChapter(prevChapter.number)}
              style={[styles.navBtn, !prevChapter && styles.navBtnDisabled]}
            >
              <Text style={styles.navBtnText}>上一话</Text>
            </Pressable>
            <Pressable onPress={() => setChaptersOpen(true)} style={styles.navBtn}>
              <Text style={styles.navBtnText}>目录</Text>
            </Pressable>
            <Pressable
              disabled={!nextChapter}
              onPress={() => nextChapter && openChapter(nextChapter.number)}
              style={[styles.navBtn, !nextChapter && styles.navBtnDisabled]}
            >
              <Text style={styles.navBtnText}>下一话</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>阅读设置</Text>
            <Text style={styles.sheetLabel}>阅读方式</Text>
            <View style={styles.row}>
              {(['webtoon', 'paged'] as ReaderMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => saveSettings({ ...settings, mode })}
                  style={[styles.chip, settings.mode === mode && styles.chipOn]}
                >
                  <Text style={[styles.chipText, settings.mode === mode && styles.chipTextOn]}>
                    {mode === 'webtoon' ? '条漫连续' : '翻页'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetLabel}>翻页方向</Text>
            <View style={styles.row}>
              <Pressable onPress={() => saveSettings({ ...settings, rtl: false })} style={[styles.chip, !settings.rtl && styles.chipOn]}>
                <Text style={[styles.chipText, !settings.rtl && styles.chipTextOn]}>从左向右</Text>
              </Pressable>
              <Pressable onPress={() => saveSettings({ ...settings, rtl: true })} style={[styles.chip, settings.rtl && styles.chipOn]}>
                <Text style={[styles.chipText, settings.rtl && styles.chipTextOn]}>从右向左</Text>
              </Pressable>
            </View>
            <Text style={styles.sheetLabel}>背景</Text>
            <View style={styles.row}>
              {(['black', 'gray', 'white'] as ReaderBg[]).map((bgKey) => (
                <Pressable
                  key={bgKey}
                  onPress={() => saveSettings({ ...settings, bg: bgKey })}
                  style={[styles.chip, settings.bg === bgKey && styles.chipOn]}
                >
                  <Text style={[styles.chipText, settings.bg === bgKey && styles.chipTextOn]}>
                    {bgKey === 'black' ? '纯黑' : bgKey === 'gray' ? '深灰' : '浅色'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetLabel}>遮罩亮度</Text>
            <View style={styles.row}>
              {[0, 0.15, 0.3, 0.45].map((value) => (
                <Pressable
                  key={value}
                  onPress={() => saveSettings({ ...settings, brightness: value })}
                  style={[styles.chip, settings.brightness === value && styles.chipOn]}
                >
                  <Text style={[styles.chipText, settings.brightness === value && styles.chipTextOn]}>
                    {value === 0 ? '关' : `${Math.round(value * 100)}%`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetHint}>点屏幕左侧上一页、右侧下一页、中间显示/隐藏工具栏。</Text>
          </Pressable>
        </Pressable>
      </Modal>

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
                  <Text style={[styles.chapterText, item.number === chapterNumber && styles.chapterTextOn]} numberOfLines={1}>
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
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  pageHud: { fontSize: 11, opacity: 0.7, position: 'absolute', right: 12 },
  endText: { fontSize: 13, paddingVertical: spacing.lg, textAlign: 'center' },
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
    paddingVertical: 10,
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  modalBg: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sheetLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  sheetHint: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.white },
  chapterRow: { paddingVertical: 10 },
  chapterRowOn: { opacity: 1 },
  chapterText: { color: colors.text, fontSize: 14 },
  chapterTextOn: { color: colors.primary, fontWeight: '800' },
});
