'use client';

import React, {
  useEffect,
  useRef,
  type InputEvent as ReactInputEvent,
  type InputEventHandler,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

export type TextareaHeightTarget = {
  style: { height: string };
  readonly scrollHeight: number;
  readonly clientHeight?: number;
  readonly offsetHeight?: number;
};

export function syncTextareaHeight(textarea: TextareaHeightTarget) {
  textarea.style.height = 'auto';
  const borderHeight =
    textarea.offsetHeight != null && textarea.clientHeight != null
      ? textarea.offsetHeight - textarea.clientHeight
      : 0;
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
}

export function handleAutoGrowTextareaInput(
  event: ReactInputEvent<HTMLTextAreaElement>,
  onInput?: InputEventHandler<HTMLTextAreaElement>,
) {
  syncTextareaHeight(event.currentTarget);
  onInput?.(event);
}

export function normalizeSingleLineText(value: string): string {
  return value.replace(/[\r\n]+/g, '');
}

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  singleLine?: boolean;
};

export function AutoGrowTextarea({
  className,
  onInput,
  value,
  defaultValue,
  singleLine = false,
  onKeyDown,
  onPaste,
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) syncTextareaHeight(textareaRef.current);
  }, [value, defaultValue]);

  return (
    <textarea
      ref={textareaRef}
      className={cn(
        'admin-input overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]',
        className,
      )}
      onInput={(event) => handleAutoGrowTextareaInput(event, onInput)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (singleLine && event.key === 'Enter' && !event.defaultPrevented) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        onPaste?.(event);
        if (!singleLine || event.defaultPrevented) return;
        const pasted = event.clipboardData.getData('text');
        const normalized = normalizeSingleLineText(pasted);
        if (normalized === pasted) return;
        event.preventDefault();
        const target = event.currentTarget;
        target.setRangeText(
          normalized,
          target.selectionStart,
          target.selectionEnd,
          'end',
        );
        syncTextareaHeight(target);
      }}
      value={value}
      defaultValue={defaultValue}
      {...props}
    />
  );
}
