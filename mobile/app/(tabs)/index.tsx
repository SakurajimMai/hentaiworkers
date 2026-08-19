import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AnimeCard } from '../../components/AnimeCard';
import { AppState } from '../../components/AppState';
import { FeedAdCard } from '../../components/FeedAdCard';
import { MangaCard } from '../../components/MangaCard';
import { SplashScreen } from '../../components/SplashScreen';
import { colors, spacing, virtualizedListProps } from '../../constants/theme';
import { loadAdsConfig, useCatalogSlots } from '../../services/ads';
import { animeApi, mangaApi } from '../../services/api';
import { Anime, MangaSummary } from '../../services/types';

const PAGE_SIZE = 30;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [animes, setAnimes] = useState<Anime[]>([]);
  const [mangas, setMangas] = useState<MangaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horizontalPadding = spacing.lg;
  const gridGap = spacing.md;
  const columns = width >= 600 ? 4 : 3;
  const cardWidth = useMemo(
    () => (width - horizontalPadding * 2 - gridGap * (columns - 1)) / columns,
    [width, columns, gridGap],
  );
  const itemKey = useCallback((item: Anime) => String(item.id), []);
  const { slots } = useCatalogSlots(animes, itemKey);

  const loadAnimes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [response, mangaResponse] = await Promise.all([
        animeApi.getAnimeList({ page: 1, limit: PAGE_SIZE, sort: 'popular' }),
        mangaApi.getMangaList({ page: 1, limit: 10 }).catch(() => ({ data: [] as MangaSummary[] })),
      ]);
      setAnimes(response.data);
      setMangas(mangaResponse.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnimes();
  }, [loadAnimes]);

  const renderItem = ({ item, index }: ListRenderItemInfo<(typeof slots)[number]>) => {
    const columnIndex = index % columns;
    return (
      <View
        style={{
          width: cardWidth,
          marginRight: columnIndex === columns - 1 ? 0 : gridGap,
        }}
      >
        {item.type === 'ad' ? (
          <FeedAdCard ad={item.ad} />
        ) : (
          <AnimeCard anime={item.item} onPress={() => router.push(`/detail/${item.item.id}`)} />
        )}
      </View>
    );
  };

  if (loading && animes.length === 0) {
    return <SplashScreen />;
  }

  if (error && animes.length === 0) {
    return (
      <SafeAreaView collapsable={false} style={styles.screen} edges={['top']}>
        <AppState title="加载失败" description={error} actionLabel="重试" onAction={loadAnimes} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView collapsable={false} style={styles.screen} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <Text style={styles.title}>热门</Text>
      </View>

      <FlatList
        key={`home-${columns}`}
        data={slots}
        keyExtractor={(item) => item.key}
        numColumns={columns}
        renderItem={renderItem}
        {...virtualizedListProps}
        overScrollMode="never"
        ListHeaderComponent={
          mangas.length > 0 ? (
            <View style={styles.mangaBlock}>
              <View style={styles.mangaHeading}>
                <Text style={styles.mangaTitle}>漫画</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="查看全部漫画"
                  onPress={() => router.push('/manga')}
                  hitSlop={8}
                >
                  <Text style={styles.mangaMore}>全部</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mangaRow}
              >
                {mangas.map((item) => (
                  <View key={item.id} style={{ width: 108 }}>
                    <MangaCard manga={item} onPress={() => router.push(`/manga-detail/${item.id}`)} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => {
              setRefreshing(true);
              loadAdsConfig(true);
              loadAnimes();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  mangaBlock: {
    marginBottom: spacing.sm,
  },
  mangaHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  mangaTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  mangaMore: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  mangaRow: {
    gap: spacing.md,
  },
});
