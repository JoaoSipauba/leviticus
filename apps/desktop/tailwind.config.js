/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          app:      '#030712',
          sidebar:  '#0d0d16',
          card:     '#13131f',
          elevated: '#161625',
        },
        brand: {
          DEFAULT: '#3b82f6',
          active:  '#2563eb',
          soft:    '#60a5fa',
        },
        type: {
          normal:       '#9ca3af',
          playback:     '#60a5fa',
          instrumental: '#a78bfa',
          vs:           '#fb923c',
        },
        heading:  '#f3f4f6',
        body:     '#9ca3af',
        muted:    '#6b7280',
        hairline: 'rgba(255,255,255,0.06)',
        divider:  'rgba(255,255,255,0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['64px', { lineHeight: '1.1',  letterSpacing: '-0.02em',  fontWeight: 500 }],
        h2:      ['32px', { lineHeight: '1.2',  letterSpacing: '-0.01em',  fontWeight: 500 }],
        h3:      ['20px', { lineHeight: '1.3',  letterSpacing: '-0.005em', fontWeight: 600 }],
        body:    ['18px', { lineHeight: '1.55', letterSpacing: '0',        fontWeight: 400 }],
        caps:    ['13px', { lineHeight: '1.4',  letterSpacing: '0.12em',   fontWeight: 500 }],
      },
    },
  },
  plugins: [],
}
