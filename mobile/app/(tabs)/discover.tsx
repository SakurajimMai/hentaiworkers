import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AnimeCard } from '../../components/AnimeCard';
import { AppState } from '../../components/AppState';
import { FeedAdCard } from '../../components/FeedAdCard';
import { colors, radius, spacing, virtualizedListProps } from '../../constants/theme';
import { loadAdsConfig, useCatalogSlots } from '../../services/ads';
import { animeApi } from '../../services/api';
import { Anime } from '../../services/types';

const PAGE_SIZE = 30;

function normalizeParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ search?: string; tag?: string; tagName?: string }>();
  const initialSearch = normalizeParam(params.search) || '';
  const tagId = normalizeParam(params.tag);
  const tagName = normalizeParam(params.tagName);

  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const horizontalPadding = spacing.lg;
  const gridGap = spacing.md;
  const columns = width >= 600 ? 4 : 3;
  const cardWidth = useMemo(
    () => (width - horizontalPadding * 2 - gridGap * (columns - 1)) / columns,
    [width, columns, gridGap],
  );
  const itemKey = useCallback((item: Anime) => String(item.id), []);
  const { slots } = useCatalogSlots(animes, itemKey);

  const loadAnimes = useCallback(
    async (nextPage: number, append = false) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError(null);
        const response = await animeApi.getAnimeList({
          page: nextPage,
          limit: PAGE_SIZE,
          search: appliedSearch,
          tagId: tagId ? Number(tagId) : undefined,
        });
        setAnimes((prev) => {
          if (!append || nextPage <= 1) return response.data;
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...response.data.filter((item) => !seen.has(item.id))];
        });
        setPage(response.pagination.page);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [appliedSearch, tagId],
  );

  useEffect(() => {
    setSearchText(initialSearch);
    setAppliedSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);

  useEffect(() => {
    void loadAnimes(1, false);
  }, [loadAnimes]);

  const submitSearch = () => {
    setPage(1);
    setAppliedSearch(searchText.trim());
  };

  const clearTag = () => {
    router.replace('/discover');
  };

  const loadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    void loadAnimes(page + 1, true);
  };

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

  return (
    <SafeAreaView collapsable={false} style={styles.screen} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <Text style={styles.title}>发现</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color={colors.textSubtle} />
          <TextInput
            accessibilityLabel="搜索动漫"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearchText}
            onSubmitEditing={submitSearch}
            placeholder="搜索动漫"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchText}
          />
        </View>
        {tagId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清除标签筛选"
            onPress={clearTag}
            style={({ pressed }) => [styles.tagPill, pressed && styles.tagPillPressed]}
          >
            <Text style={styles.tagPillText}>
              {tagName || `#${tagId}`}
            </Text>
            <Ionicons name="close" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        key={`discover-${columns}`}
        data={slots}
        keyExtractor={(item) => item.key}
        numColumns={columns}
        renderItem={renderItem}
        {...virtualizedListProps}
        overScrollMode="never"
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        ListEmptyComponent={
          loading ? (
            <AppState loading title="正在加载" />
          ) : error ? (
            <AppState title="加载失败" description={error} actionLabel="重试" onAction={() => loadAnimes(page)} />
          ) : (
            <AppState title="没有内容" description="尝试搜索其它关键词" />
          )
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.feedFooter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : animes.length > 0 ? (
            <Text style={styles.feedHint}>
              {page >= totalPages ? `共 ${total} 部` : '上滑加载更多'}
            </Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => {
              setRefreshing(true);
              loadAdsConfig(true);
              loadAnimes(1);
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
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    paddingVertical: spacing.xs,
  },
  tagPill: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagPillPressed: {
    opacity: 0.78,
  },
  tagPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  metaText: {
    color: colors.textSubtle,
    fontSize: 11,
    textAlign: 'center',
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  pageNav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pageNavDisabled: {
    opacity: 0.4,
  },
  pageNum: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    minWidth: 36,
    paddingHorizontal: spacing.xs,
  },
  pageNumActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pageNumText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  pageNumTextActive: {
    color: colors.white,
  },
  pageGap: {
    color: colors.textSubtle,
    fontSize: 13,
    paddingHorizontal: 2,
  },
  pagePressed: {
    opacity: 0.78,
  },
  feedFooter: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  feedHint: {
    color: colors.textSubtle,
    fontSize: 12,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
});
