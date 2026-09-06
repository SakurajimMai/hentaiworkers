'use client';

import { useState } from 'react';
import { AD_SIZE_PRESETS, MAX_AD_HEIGHT, MAX_AD_WIDTH, type AdDimensions } from '@/lib/ad-dimensions';

export function AdSizeFields({
  name,
  initial = {},
  value,
  onChange,
}: {
  name?: string;
  initial?: AdDimensions;
  value?: AdDimensions;
  onChange?: (dimensions: AdDimensions) => void;
}) {
  const [local, setDimensions] = useState({ width: initial.width || 0, height: initial.height || 0 });
  const dimensions = value ? { width: value.width || 0, height: value.height || 0 } : local;
  const preset = AD_SIZE_PRESETS.find((size) => size.width === dimensions.width && size.height === dimensions.height);
  const [custom, setCustom] = useState(!preset);
  const update = (next: typeof dimensions) => {
    setDimensions(next);
    onChange?.(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block font-meta text-[12px]">
        广告尺寸
        <select
          className="admin-input mt-1"
          value={custom ? 'custom' : `${dimensions.width}x${dimensions.height}`}
          onChange={(event) => {
            const isCustom = event.target.value === 'custom';
            setCustom(isCustom);
            if (isCustom) {
              if (!dimensions.width || !dimensions.height) update({ width: 728, height: 90 });
            } else {
              const size = AD_SIZE_PRESETS.find((option) => `${option.width}x${option.height}` === event.target.value);
              if (size) update({ width: size.width, height: size.height });
            }
          }}
        >
          {AD_SIZE_PRESETS.map((size) => (
            <option key={size.label} value={`${size.width}x${size.height}`}>{size.label}</option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </label>
      <label className="block font-meta text-[12px]">
        宽度（px）
        <input
          type="number"
          name={name ? `${name}Width` : undefined}
          min={custom ? 1 : 0}
          max={MAX_AD_WIDTH}
          required={custom}
          readOnly={!custom}
          value={dimensions.width}
          onChange={(event) => update({ ...dimensions, width: Number(event.target.value) })}
          className="admin-input mt-1"
        />
      </label>
      <label className="block font-meta text-[12px]">
        高度（px）
        <input
          type="number"
          name={name ? `${name}Height` : undefined}
          min={custom ? 1 : 0}
          max={MAX_AD_HEIGHT}
          required={custom}
          readOnly={!custom}
          value={dimensions.height}
          onChange={(event) => update({ ...dimensions, height: Number(event.target.value) })}
          className="admin-input mt-1"
        />
      </label>
    </div>
  );
}
