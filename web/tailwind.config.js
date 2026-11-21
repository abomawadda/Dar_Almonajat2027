/** Design tokens carried over from dar-erp v4–v7 (gold on warm paper). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F6F3',
        card: '#FFFFFF',
        field: '#F3F2EF',
        ink: { DEFAULT: '#1A1A1A', soft: '#4B5563', muted: '#9CA3AF' },
        gold: { 50: '#FDF8EF', 100: '#FBF0D9', 400: '#B8923F', 500: '#8B6D2F', 600: '#6B5220' },
        ok:   { DEFAULT: '#059669', soft: '#D1FAE5' },
        warn: { DEFAULT: '#D97706', soft: '#FEF3C7' },
        bad:  { DEFAULT: '#DC2626', soft: '#FEE2E2' },
        info: { DEFAULT: '#2563EB', soft: '#DBEAFE' },
        violet: { DEFAULT: '#7C3AED', soft: '#EDE9FE' }
      },
      fontFamily: {
        sans: ['Tajawal', 'Noto Naskh Arabic', 'system-ui', 'sans-serif'],
        quran: ['Amiri', 'Noto Naskh Arabic', 'serif']
      },
      borderColor: { DEFAULT: 'rgba(0,0,0,0.07)' },
      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.03)',
        card: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
        lift: '0 10px 24px -10px rgba(107,82,32,.45)'
      },
      backgroundImage: { 'gold-grad': 'linear-gradient(135deg,#B8923F,#8B6D2F 55%,#6B5220)' },
      keyframes: {
        shimmer: { to: { backgroundPosition: '-200% 0' } },
        up: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } }
      },
      animation: { shimmer: 'shimmer 1.2s infinite', up: 'up .3s cubic-bezier(.4,0,.2,1)', fade: 'fade .2s' }
    }
  },
  plugins: []
}
