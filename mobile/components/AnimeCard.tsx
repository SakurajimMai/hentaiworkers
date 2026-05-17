import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Anime } from '../services/types';
import { colors, radius, spacing } from '../constants/theme';
import { normalizeMediaUrl } from '../services/media';

interface AnimeCardProps {
  anime: Anime;
  width?: number;
  onPress: () => void;
}

export function AnimeCard({ anime, width, onPress }: AnimeCardProps) {
  const subtitle =
    anime.titleJapanese ||
    anime.titleEnglish ||
    (anime.releaseYear ? `${anime.releaseYear}` : ' ');
  const cover = normalizeMediaUrl(anime.cover);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看 ${anime.title}`}
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
        <View style={styles.coverOverlay} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {anime.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
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
    position: 'relative',
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
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  body: {
    gap: 2,
    height: 58,
    paddingHorizontal: 2,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    height: 36,
    lineHeight: 18,
  },
  subtitle: {
    color: colors.textSubtle,
    fontSize: 11,
    height: 14,
    lineHeight: 14,
  },
});
