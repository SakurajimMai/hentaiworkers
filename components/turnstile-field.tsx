'use client';

import Script from 'next/script';
import { useEffect, useId, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

/**
 * Cloudflare Turnstile widget. Writes token into hidden input `cf-turnstile-response`
 * (and name="turnstileToken" for our forms).
 */
export function TurnstileField({ siteKey }: { siteKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const reactId = useId();

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const render = () => {
      if (!window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
      containerRef.current.innerHTML = '';
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token) => {
          if (inputRef.current) inputRef.current.value = token;
        },
        'expired-callback': () => {
          if (inputRef.current) inputRef.current.value = '';
        },
      });
    };

    if (window.turnstile) {
      render();
    } else {
      window.onTurnstileLoad = render;
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey]);

  return (
    <div className="space-y-2" data-turnstile={reactId}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad"
        strategy="afterInteractive"
      />
      <input ref={inputRef} type="hidden" name="turnstileToken" defaultValue="" />
      <div ref={containerRef} className="min-h-[65px]" />
    </div>
  );
}
