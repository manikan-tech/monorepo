import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Night Blue / Teal (Primary)
        forest: {
          50:  '#EDF4F5',
          100: '#D4E8EB',
          200: '#A8D0D6',
          300: '#72B0BA',
          400: '#4A8F99',
          500: '#2d545e',
          600: '#265059',
          700: '#1e4a53',
          800: '#163c44',
          900: '#12343b',
          950: '#0a2229',
        },
        // Sand Tan (Gold/Accent)
        gold: {
          50:  '#FDF7EE',
          100: '#FAEDD8',
          200: '#F5D9B0',
          300: '#ECC480',
          400: '#e1b382',
          500: '#D49B63',
          600: '#c89666',
          700: '#A87548',
          800: '#885C38',
          900: '#6E4A2C',
        },
        // Cream Neutrals (Surfaces/Elevations)
        cream: {
          50:  '#F4F8F8',
          100: '#E6F0F1',
          200: '#C8E0E3',
          300: '#A0C7CC',
          400: '#72A8AF',
          500: '#4A8892',
        },
        // Semantic Surface Tokens
        manikan: {
          bg:     '#F3F7F7',
          card:   '#FFFFFF',
          border: '#E2E8F0',
          'border-focus': '#1B3A4B',
          muted:  '#6B7280',
          text:   '#1A1A2E',
          'text-secondary': '#4A5568',
          teal:   '#1B3A4B',
          'teal-hover': '#254d63',
          error:  '#E53E3E',
          success:'#38A169',
          'input-bg': '#F7FAFC',
          cream:  '#F8F7F4',
        }
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'DM Serif Display', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        arabic:  ['Cairo', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 20px rgba(18, 52, 59, 0.07)',
        'card': '0 4px 32px rgba(18, 52, 59, 0.10)',
        'lift': '0 8px 48px rgba(18, 52, 59, 0.16)',
        'gold': '0 4px 24px rgba(200, 150, 102, 0.22)',
        'glow': '0 0 40px rgba(45, 84, 94, 0.18)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-up': 'fadeUp 0.6s ease-out forwards',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer-fast': 'shimmer 3s linear infinite',
        'shimmer-slow': 'shimmer 4s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'slow-zoom': 'slowZoom 20s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(45,84,94,0.12)' },
          '50%': { boxShadow: '0 0 44px rgba(45,84,94,0.30)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        slowZoom: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        }
      }
    }
  },
  plugins: [],
};

export default config;
