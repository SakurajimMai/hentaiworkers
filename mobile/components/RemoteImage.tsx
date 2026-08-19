import React from 'react';
import { Image, type ImageProps } from 'react-native';

/**
 * Android Image fades in over ~300ms from an empty surface. During scroll
 * recycling and stack pop that empty surface reads as a gray/blank page.
 */
export function RemoteImage(props: ImageProps) {
  return <Image {...props} fadeDuration={0} />;
}
