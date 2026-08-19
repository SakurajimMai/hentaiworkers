import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MangaSummary } from '../services/types';
import { colors, radius, spacing } from '../constants/theme';
import { normalizeMediaUrl } from '../services/media';

interface MangaCardProps {
  manga: Pick<MangaSummary, 'id' | 'title' | 'coverUrl' | 'author' | 'pageCount'>;
  width?: number;
  onPress: () => void;
}

export function MangaCard({ manga, width, onPress }: MangaCardProps) {
  const cover = normalizeMediaUrl(manga.coverUrl);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`阅读 ${manga.title}`}
      android_ripple={{ color: colors.primarySoft }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        width ? { width } : styles.cardFullWidth,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={styles.coverFallback}>
            <Text style={styles.coverFallbackText}>无封面</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {manga.title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    marginBottom: spacing.lg,
  },
  cardFullWidth: {
    width: '100%',
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  coverWrap: {
    aspectRatio: 2 / 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '100%',
  },
  cover: {
    height: '100%',
    width: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  coverFallbackText: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  body: {
    paddingBottom: 2,
    paddingHorizontal: 2,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 36,
  },
});
