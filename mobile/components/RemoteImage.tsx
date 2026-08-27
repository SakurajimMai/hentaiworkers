import React from 'react';
import { Image, type ImageProps, type ImageSourcePropType } from 'react-native';
import { imageRequestHeaders } from '../services/media';

function withHeaders(source: ImageSourcePropType | undefined): ImageSourcePropType | undefined {
  if (!source || typeof source === 'number' || Array.isArray(source)) return source;
  if (typeof source !== 'object' || !('uri' in source) || !source.uri) return source;
  return {
    ...source,
    headers: {
      ...imageRequestHeaders(),
      ...(source.headers || {}),
    },
  };
}

/**
 * Android Image fades in over ~300ms from an empty surface. During scroll
 * recycling that empty surface reads as a gray/blank cover.
 */
export function RemoteImage({ source, ...props }: ImageProps) {
  return <Image {...props} source={withHeaders(source)} fadeDuration={0} />;
}
