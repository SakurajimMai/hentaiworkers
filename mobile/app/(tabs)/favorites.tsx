import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../components/AppState';
import { colors, radius, spacing } from '../../constants/theme';
import { normalizeMediaUrl } from '../../services/media';
import { FavoriteItem, favoritesStore } from '../../services/storage';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const horizontalPadding = spacing.lg;
  const gridGap = spacing.md;
  const columns = width >= 600 ? 4 : 3;
  const cardWidth = (width - horizontalPadding * 2 - gridGap * (columns - 1)) / columns;

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      favoritesStore.list().then((items) => {
        if (mounted) {
          setFavorites(items);
          setLoaded(true);
        }
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const remove = async (id: number) => {
    await favoritesStore.remove(id);
    const next = await favoritesStore.list();
    setFavorites(next);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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
          {favorites.length > 0 ? (
            <Text style={styles.editText}>{editing ? '完成' : '编辑'}</Text>
          ) : null}
        </Pressable>
      </View>

      {!loaded ? (
        <AppState loading title="正在加载收藏" />
      ) : favorites.length === 0 ? (
        <AppState
          title="还没有收藏"
          description="在详情页点收藏，作品就会出现在这里。"
        />
      ) : (
        <FlatList
          key={`fav-${columns}`}
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          numColumns={columns}
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.lg,
          }}
          columnWrapperStyle={columns > 1 ? { gap: gridGap } : undefined}
          renderItem={({ item }) => {
            const cover = normalizeMediaUrl(item.cover);
            return (
              <View style={{ width: cardWidth }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`查看 ${item.title}`}
                  onPress={() => router.push(`/detail/${item.id}`)}
                  style={({ pressed }) => [styles.cardCover, pressed && styles.cardPressed]}
                >
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.image} />
                  ) : (
                    <View style={[styles.image, styles.imageFallback]} />
                  )}
                  {editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`移除 ${item.title}`}
                      onPress={() => remove(item.id)}
                      style={styles.removeBtn}
                      hitSlop={10}
                    >
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  ) : null}
                </Pressable>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                {item.titleJapanese ? (
                  <Text style={styles.cardSub} numberOfLines={1}>{item.titleJapanese}</Text>
                ) : null}
              </View>
            );
          }}
        />
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
