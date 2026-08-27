import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../components/AppState';
import { RemoteImage } from '../../components/RemoteImage';
import { colors, radius, spacing } from '../../constants/theme';
import { normalizeMediaUrl } from '../../services/media';
import { listFavorites, removeAnimeFavorite, removeMangaFavorite } from '../../services/library';
import { FavoriteItem, MangaFavoriteItem } from '../../services/storage';
import { useSession } from '../../services/session';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [animes, setAnimes] = useState<FavoriteItem[]>([]);
  const [mangas, setMangas] = useState<MangaFavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { user, ready } = useSession();

  const horizontalPadding = spacing.lg;
  const gridGap = spacing.md;
  const columns = width >= 600 ? 4 : 3;
  const cardWidth = (width - horizontalPadding * 2 - gridGap * (columns - 1)) / columns;

  const reload = async () => {
    const { animes: animeItems, mangas: mangaItems } = await listFavorites();
    setAnimes(animeItems);
    setMangas(mangaItems);
    setLoaded(true);
  };

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      if (!ready) return;
      reload().then(() => {
        if (!mounted) return;
      });
      return () => {
        mounted = false;
      };
    }, [ready, user?.id]),
  );

  const removeAnime = async (id: number) => {
    await removeAnimeFavorite(id);
    await reload();
  };

  const removeManga = async (id: number) => {
    await removeMangaFavorite(id);
    await reload();
  };

  const empty = loaded && animes.length === 0 && mangas.length === 0;

  const chunk = useMemo(() => {
    return { cardWidth, columns, gridGap };
  }, [cardWidth, columns, gridGap]);

  return (
    <SafeAreaView collapsable={false} style={styles.screen} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.headerSide} />
        <Text style={styles.title}>我的收藏</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? '完成' : '编辑'}
          onPress={() => setEditing((v) => !v)}
          hitSlop={8}
          style={styles.headerSide}
        >
          {!empty ? (
            <Text style={styles.editText}>{editing ? '完成' : '编辑'}</Text>
          ) : null}
        </Pressable>
      </View>

      {!loaded ? (
        <AppState loading title="正在加载收藏" />
      ) : empty ? (
        <AppState
          title="还没有收藏"
          description={
            user
              ? '网页和 App 共用同一份收藏。在详情页点爱心即可同步。'
              : '登录后可与网页收藏互通。未登录时收藏只保存在这台设备。'
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {animes.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>里番</Text>
              <View style={[styles.grid, { gap: chunk.gridGap }]}>
                {animes.map((item) => {
                  const cover = normalizeMediaUrl(item.cover);
                  return (
                    <View key={`anime-${item.id}`} style={{ width: chunk.cardWidth }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`查看 ${item.title}`}
                        onPress={() => router.push(`/detail/${item.id}`)}
                        style={({ pressed }) => [styles.cardCover, pressed && styles.cardPressed]}
                      >
                        {cover ? (
                          <RemoteImage source={{ uri: cover }} style={styles.image} />
                        ) : (
                          <View style={[styles.image, styles.imageFallback]} />
                        )}
                        {editing ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`移除 ${item.title}`}
                            onPress={() => removeAnime(item.id)}
                            style={styles.removeBtn}
                            hitSlop={10}
                          >
                            <Ionicons name="close" size={14} color={colors.white} />
                          </Pressable>
                        ) : null}
                      </Pressable>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {mangas.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>漫画</Text>
              <View style={[styles.grid, { gap: chunk.gridGap }]}>
                {mangas.map((item) => {
                  const cover = normalizeMediaUrl(item.coverUrl);
                  return (
                    <View key={`manga-${item.id}`} style={{ width: chunk.cardWidth }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`阅读 ${item.title}`}
                        onPress={() => router.push(`/manga-detail/${item.id}`)}
                        style={({ pressed }) => [styles.cardCover, pressed && styles.cardPressed]}
                      >
                        {cover ? (
                          <RemoteImage source={{ uri: cover }} style={styles.image} />
                        ) : (
                          <View style={[styles.image, styles.imageFallback]} />
                        )}
                        {editing ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`移除 ${item.title}`}
                            onPress={() => removeManga(item.id)}
                            style={styles.removeBtn}
                            hitSlop={10}
                          >
                            <Ionicons name="close" size={14} color={colors.white} />
                          </Pressable>
                        ) : null}
                      </Pressable>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  headerSide: {
    minWidth: 50,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  editText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardCover: {
    aspectRatio: 2 / 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  cardPressed: {
    opacity: 0.84,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFallback: {
    backgroundColor: colors.surfaceMuted,
  },
  removeBtn: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  cardSub: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
});
