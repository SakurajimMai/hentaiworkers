/** @type {import('tailwindcss').Config} */
const tailwindConfig = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Noto Sans SC"', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0,0,0,0.04)',
        whisper: '0 2px 8px rgba(0,0,0,0.04)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default tailwindConfig;
