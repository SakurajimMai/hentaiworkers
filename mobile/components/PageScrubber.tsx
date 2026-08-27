import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';

export function PageScrubber({
  index,
  total,
  onSeek,
}: {
  index: number;
  total: number;
  onSeek: (next: number) => void;
}) {
  const trackWidth = useRef(1);
  const originX = useRef(0);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? index;
  const max = Math.max(total - 1, 0);

  const seekFromX = (x: number) => {
    if (total <= 1) return 0;
    const ratio = Math.max(0, Math.min(1, x / Math.max(trackWidth.current, 1)));
    return Math.round(ratio * max);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        originX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        setPreview(seekFromX(event.nativeEvent.locationX));
      },
      onPanResponderMove: (event) => {
        setPreview(seekFromX(event.nativeEvent.pageX - originX.current));
      },
      onPanResponderRelease: (event) => {
        const next = seekFromX(event.nativeEvent.pageX - originX.current);
        setPreview(null);
        onSeek(next);
      },
      onPanResponderTerminate: () => {
        setPreview(null);
      },
    }),
  ).current;

  const ratio = max <= 0 ? 1 : shown / max;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {Math.min(shown + 1, Math.max(total, 1))} / {Math.max(total, 0)}
      </Text>
      <View
        style={styles.hit}
        onLayout={(event) => {
          trackWidth.current = event.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  label: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  hit: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 99,
    height: 4,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.white,
    height: 4,
  },
  thumb: {
    backgroundColor: colors.white,
    borderRadius: 9,
    elevation: 2,
    height: 18,
    marginLeft: -9,
    position: 'absolute',
    top: 5,
    width: 18,
  },
});
