import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export function ZoomableReader({
  children,
  onZoomChange,
}: {
  children: React.ReactNode;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const setZoomed = (value: boolean) => {
    onZoomChange?.(value);
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      runOnJS(setZoomed)(true);
    })
    .onUpdate((event) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
      scale.value = next;
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(MIN_SCALE);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = MIN_SCALE;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(setZoomed)(false);
      } else {
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        runOnJS(setZoomed)(true);
      }
    });

  // 未放大时不要抢竖滑；放大后才平移画面。
  const pan = Gesture.Pan()
    .manualActivation(true)
    .minPointers(1)
    .maxPointers(2)
    .onTouchesMove((_event, manager) => {
      if (scale.value > 1.02) manager.activate();
      else manager.fail();
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      const maxX = ((scale.value - 1) * box.width) / 2;
      const maxY = ((scale.value - 1) * box.height) / 2;
      const nextX = savedTx.value + event.translationX;
      const nextY = savedTy.value + event.translationY;
      tx.value = Math.max(-maxX, Math.min(maxX, nextX));
      ty.value = Math.max(-maxY, Math.min(maxY, nextY));
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const nativeScroll = Gesture.Native();
  const composed = Gesture.Simultaneous(nativeScroll, pinch, pan);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setBox({ width, height });
  };

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.clip} onLayout={onLayout} collapsable={false}>
        <Animated.View style={[styles.fill, style]} collapsable={false}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
