import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { colors, radius, spacing } from '../../constants/theme';
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
    async (nextPage: number) => {
      try {
        setLoading(true);
        setError(null);
        const response = await animeApi.getAnimeList({
          page: nextPage,
          limit: PAGE_SIZE,
          search: appliedSearch,
          tagId: tagId ? Number(tagId) : undefined,
        });
        setAnimes(response.data);
        setPage(response.pagination.page);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
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
    loadAnimes(page);
  }, [loadAnimes, page]);

  const submitSearch = () => {
    setPage(1);
    setAppliedSearch(searchText.trim());
  };

  const clearTag = () => {
    router.replace('/discover');
  };

  const changePage = (next: number) => {
    if (!loading && next >= 1 && next <= totalPages && next !== page) {
      setPage(next);
    }
  };

  const pageItems = useMemo<(number | 'gap')[]>(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) {
      return [1, 2, 3, 'gap', totalPages];
    }
    if (page >= totalPages - 2) {
      return [1, 'gap', totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, 'gap', page, 'gap', totalPages];
  }, [page, totalPages]);

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
    <SafeAreaView style={styles.screen} edges={['top']}>
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
        ListFooterComponent={
          animes.length > 0 && totalPages > 1 ? (
            <View style={styles.pagination}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="上一页"
                disabled={page <= 1}
                onPress={() => changePage(page - 1)}
                style={({ pressed }) => [
                  styles.pageNav,
                  page <= 1 && styles.pageNavDisabled,
                  pressed && page > 1 && styles.pagePressed,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={page <= 1 ? colors.textSubtle : colors.text}
                />
              </Pressable>
              {pageItems.map((item, idx) =>
                item === 'gap' ? (
                  <Text key={`gap-${idx}`} style={styles.pageGap}>
                    ···
                  </Text>
                ) : (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={`第 ${item} 页`}
                    onPress={() => changePage(item)}
                    style={({ pressed }) => [
                      styles.pageNum,
                      item === page && styles.pageNumActive,
                      pressed && item !== page && styles.pagePressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageNumText,
                        item === page && styles.pageNumTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ),
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="下一页"
                disabled={page >= totalPages}
                onPress={() => changePage(page + 1)}
                style={({ pressed }) => [
                  styles.pageNav,
                  page >= totalPages && styles.pageNavDisabled,
                  pressed && page < totalPages && styles.pagePressed,
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={page >= totalPages ? colors.textSubtle : colors.text}
                />
              </Pressable>
            </View>
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
              loadAnimes(page);
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
});
