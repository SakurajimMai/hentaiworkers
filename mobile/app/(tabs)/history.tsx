import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../components/AppState';
import { RemoteImage } from '../../components/RemoteImage';
import { colors, radius, spacing, virtualizedListProps } from '../../constants/theme';
import { normalizeMediaUrl } from '../../services/media';
import { clearHistory, listHistory, removeHistoryItem } from '../../services/library';
import { HistoryItem, MangaHistoryItem } from '../../services/storage';
import { useSession } from '../../services/session';

type MixedHistory =
  | (HistoryItem & { kind: 'anime' })
  | (MangaHistoryItem & { kind: 'manga' });

function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function itemTime(item: MixedHistory) {
  return item.kind === 'anime' ? item.watchedAt : item.readAt;
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MixedHistory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { user, ready } = useSession();

  const reload = async () => {
    const { animes, mangas } = await listHistory();
    const mixed: MixedHistory[] = [
      ...animes.map((item) => ({ ...item, kind: 'anime' as const })),
      ...mangas.map((item) => ({ ...item, kind: 'manga' as const })),
    ].sort((a, b) => itemTime(b) - itemTime(a));
    setItems(mixed);
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

  const remove = async (item: MixedHistory) => {
    await removeHistoryItem(item.kind, item.id);
    await reload();
  };

  const clearAll = async () => {
    await clearHistory();
    setItems([]);
    setEditing(false);
  };

  const openItem = (item: MixedHistory) => {
    if (item.kind === 'anime') router.push(`/detail/${item.id}`);
    else router.push(`/manga-reader/${item.id}/${item.chapterNumber}`);
  };

  return (
    <SafeAreaView collapsable={false} style={styles.screen} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <View style={styles.headerSide} />
        <Text style={styles.title}>历史记录</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? '完成' : '编辑'}
          onPress={() => setEditing((v) => !v)}
          hitSlop={8}
          style={styles.headerSide}
        >
          {items.length > 0 ? (
            <Text style={styles.editText}>{editing ? '完成' : '编辑'}</Text>
          ) : null}
        </Pressable>
      </View>

      {!loaded ? (
        <AppState loading title="正在加载历史" />
      ) : items.length === 0 ? (
        <AppState
          title="还没有记录"
          description={
            user
              ? '网页和 App 共用同一份历史。播放或阅读后会出现在这里。'
              : '登录后可与网页历史互通。未登录时记录只保存在这台设备。'
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          {...virtualizedListProps}
          overScrollMode="never"
          contentContainerStyle={{
            paddingBottom: insets.bottom + spacing.xxl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListFooterComponent={
            editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清空历史"
                onPress={clearAll}
                style={({ pressed }) => [styles.clearBtn, pressed && styles.clearPressed]}
              >
                <Text style={styles.clearText}>清空全部历史</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const cover = normalizeMediaUrl(item.kind === 'anime' ? item.cover : item.coverUrl);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`继续${item.kind === 'anime' ? '观看' : '阅读'} ${item.title}`}
                onPress={() => openItem(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {cover ? (
                  <RemoteImage source={{ uri: cover }} style={styles.cover} />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]} />
                )}
                <View style={styles.body}>
                  <Text style={styles.kind}>{item.kind === 'anime' ? '里番' : '漫画'}</Text>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  {item.kind === 'anime' && item.titleJapanese ? (
                    <Text style={styles.itemSub} numberOfLines={1}>{item.titleJapanese}</Text>
                  ) : null}
                  <Text style={styles.itemTime}>
                    {item.kind === 'manga' ? `读到第 ${item.chapterNumber} 话 · ` : '观看至 '}
                    {formatTime(itemTime(item))}
                  </Text>
                </View>
                {editing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`移除 ${item.title}`}
                    onPress={() => remove(item)}
                    style={styles.removeBtn}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={16} color={colors.text} />
                  </Pressable>
                ) : null}
              </Pressable>
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
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowPressed: {
    opacity: 0.86,
  },
  cover: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 70,
    width: 56,
  },
  coverFallback: {
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  kind: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  itemSub: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  itemTime: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clearBtn: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 44,
  },
  clearPressed: {
    opacity: 0.82,
  },
  clearText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
});
