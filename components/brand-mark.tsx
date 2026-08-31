import type { SVGProps } from 'react';

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 108 108" fill="none" aria-hidden="true" {...props}>
      <path
        fill="#F6F4EF"
        d="M30 28c0-2.3 2.3-3.8 4.5-2.9L72 39.1c4.7 1.8 8 6.3 8 11.4v7c0 5.1-3.3 9.6-8 11.4l-37.5 14c-2.2.9-4.5-.6-4.5-2.9V28Z"
      />
      <path
        fill="#D36322"
        d="m53 76 19-7.1c4.7-1.8 8-6.3 8-11.4v-3.8L59.6 65.5 53 76Z"
      />
      <path fill="#121318" d="m45 41.5 24 12.5-24 12.5v-25Z" />
    </svg>
  );
}
