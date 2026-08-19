import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { colors, radius, spacing } from '../constants/theme';
import { FeedAdSlot } from '../services/types';
import { HtmlAd } from './HtmlAd';

export function FeedAdCard({
  ad,
  width,
}: {
  ad: FeedAdSlot;
  width?: number;
}) {
  const html = (ad.html || '').trim();
  const href = (ad.href || '').trim();

  const openHref = () => {
    if (href) Linking.openURL(href).catch(() => undefined);
  };

  const frame = (
    <View style={styles.cover}>
      {html ? (
        <HtmlAd html={html} dark fill minHeight={120} maxHeight={420} />
      ) : (
        <View style={styles.placeholder}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>广告</Text>
          </View>
          <Text style={styles.title}>广告位招租</Text>
          <Text style={styles.sub}>信息流原生卡</Text>
          {href ? <Text style={styles.link}>查看广告位 →</Text> : null}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.card, width ? { width } : styles.cardFull]}>
      {href && !html ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="广告"
          onPress={openHref}
        >
          {frame}
        </Pressable>
      ) : (
        frame
      )}
      <View style={styles.body}>
        <Text style={styles.caption} numberOfLines={1}>
          {ad.name?.trim() || '广告'}
        </Text>
        <Text style={styles.captionSub} numberOfLines={1}>
          推广
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  cardFull: {
    width: '100%',
  },
  cover: {
    aspectRatio: 2 / 3,
    backgroundColor: colors.primarySoft,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    overflow: 'hidden',
    width: '100%',
  },
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  badge: {
    backgroundColor: 'rgba(10,10,15,0.86)',
    borderRadius: radius.pill,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: 'absolute',
    top: spacing.sm,
  },
  badgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sub: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 4,
  },
  link: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  body: {
    gap: 2,
    minHeight: 64,
    paddingBottom: 2,
    paddingHorizontal: 2,
    paddingTop: spacing.sm,
  },
  caption: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 18,
  },
  captionSub: {
    color: colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
  },
});
