# Manikan Design System

This is the complete, exhaustive guide to replicating the Manikan UI on a new website. It includes the exact Tailwind CSS configurations, global CSS styles, animations, and custom UI components used to create the premium fashion-tech aesthetic.

*(Note: All Arabic-specific typography and RTL configurations have been removed per your request).*

---

## 1. Typography & Google Fonts

Add these imports to the top of your `index.css` or global stylesheet:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');
```

---

## 2. Tailwind Configuration (Colors, Fonts, Shadows, Animations)

Add these custom values to your `tailwind.config.js` (or inject them via `@theme` if using Tailwind v4):

```javascript
module.exports = {
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
          border: '#CAD6D8',
          muted:  '#E6EDEF',
        }
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'DM Serif Display', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
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
        }
      }
    }
  }
}
```

---

## 3. Global CSS & Custom Utilities

Copy these classes into your global `index.css` to enable the specific UI textures and hover effects:

```css
/* ── Glassmorphism ── */
.glass {
  background: rgba(243, 247, 247, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.glass-dark {
  background: rgba(45, 84, 94, 0.14);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* ── Interactive Cards & Buttons ── */
.card-hover {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 48px rgba(18, 52, 59, 0.14); /* lift shadow */
}

.btn-glow:hover {
  box-shadow: 0 0 32px rgba(45, 84, 94, 0.38);
}

/* ── Gradients & Text Shimmers ── */
.shimmer-text {
  background: linear-gradient(90deg, #2d545e 0%, #e1b382 40%, #2d545e 80%, #e1b382 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 4s linear infinite;
}

.gold-shimmer {
  background: linear-gradient(90deg, #c89666 0%, #e1b382 40%, #c89666 70%, #f0c898 100%);
  background-size: 200% auto;
  animation: shimmer 3s linear infinite;
}

/* ── Decorative Elements ── */
/* Section background pattern */
.section-pattern {
  background-image:
    radial-gradient(circle at 20% 20%, rgba(45,84,94,0.05) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(225,179,130,0.05) 0%, transparent 50%);
}

/* Elegant line with gold gradient (for section headers) */
.ornament {
  position: relative;
}
.ornament::before, .ornament::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 60px;
  height: 1px;
  background: linear-gradient(to right, transparent, #c89666);
}
.ornament::before { right: calc(100% + 12px); }
.ornament::after { left: calc(100% + 12px); background: linear-gradient(to left, transparent, #c89666); }

/* Night Blue to Sand Tan Gradient Border */
.gradient-border {
  position: relative;
  background: #fff;
  border-radius: 1rem;
}
.gradient-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, #2d545e, #e1b382, #2d545e);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

---

## 4. Standard UI Overrides

Add these to the bottom of your CSS file to ensure consistent styling of native elements across the app:

```css
/* ── Custom Scrollbar ── */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #E6EDEF; /* manikan-muted */
}
::-webkit-scrollbar-thumb {
  background: #72B0BA; /* forest-300 */
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #2d545e; /* forest-500 */
}

/* ── Custom Text Selection ── */
::selection {
  background: rgba(45, 84, 94, 0.18); /* forest glow */
  color: #12343b; /* forest-900 */
}

/* ── Custom Range Slider (Used in the 3D Viewer/App) ── */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
  height: 6px;
}

input[type="range"]::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 9999px;
  background: #EDF4F5; /* forest-50 */
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #c89666; /* gold-600 */
  border: 2px solid #FFFFFF;
  box-shadow: 0 0 0 3px rgba(38, 80, 89, 0.15), 0 2px 8px rgba(0, 0, 0, 0.4);
  margin-top: -6px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

input[type="range"]:hover::-webkit-slider-thumb {
  transform: scale(1.2);
  box-shadow: 0 0 0 5px rgba(38, 80, 89, 0.15), 0 2px 12px rgba(38, 80, 89, 0.3);
}
```

---

## 5. Core Reusable Component: Button Classes

When creating buttons, here are the exact Tailwind class combinations that make up the system:

- **Primary Button (Forest Green)**: `bg-forest-600 text-white hover:bg-forest-700 shadow-soft hover:shadow-card btn-glow rounded-xl px-5 py-2.5 font-medium transition-all duration-300`
- **Secondary Button (Outline / White)**: `bg-white text-forest-800 border border-manikan-border hover:border-forest-200 hover:bg-forest-50 rounded-xl px-5 py-2.5 font-medium transition-all duration-300`
- **Gold Accent Button**: `bg-gold-500 text-white hover:bg-gold-600 shadow-gold rounded-xl px-5 py-2.5 font-medium transition-all duration-300`
