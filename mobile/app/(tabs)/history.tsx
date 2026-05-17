import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from '../../components/AppState';
import { colors, radius, spacing } from '../../constants/theme';
import { normalizeMediaUrl } from '../../services/media';
import { HistoryItem, historyStore } from '../../services/storage';

function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      historyStore.list().then((data) => {
        if (mounted) {
          setItems(data);
          setLoaded(true);
        }
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const remove = async (id: number) => {
    await historyStore.remove(id);
    setItems(await historyStore.list());
  };

  const clearAll = async () => {
    await historyStore.clear();
    setItems([]);
    setEditing(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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
        <AppState title="还没有观看记录" description="开始播放任意作品就会出现在这里。" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
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
            const cover = normalizeMediaUrl(item.cover);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`继续观看 ${item.title}`}
                onPress={() => router.push(`/detail/${item.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.cover} />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]} />
                )}
                <View style={styles.body}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  {item.titleJapanese ? (
                    <Text style={styles.itemSub} numberOfLines={1}>{item.titleJapanese}</Text>
                  ) : null}
                  <Text style={styles.itemTime}>观看至 {formatTime(item.watchedAt)}</Text>
                </View>
                {editing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`移除 ${item.title}`}
                    onPress={() => remove(item.id)}
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
