/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './features/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // The original SPA's single responsive breakpoint is `@media(max-width:700px)`
      // (index (1).html, MOBILE block) — not Tailwind's default 640/768/1024/etc
      // scale. `mobile:` below reproduces that exact threshold as a max-width variant.
      screens: {
        mobile: { max: '700px' },
      },
      colors: {
        bg: '#f7f5ef',
        ink: {
          DEFAULT: '#1c1917',
          2: '#44403c',
        },
        muted: '#78716c',
        border: {
          DEFAULT: '#e7e5e0',
          2: '#d6d3cd',
        },
        brand: {
          DEFAULT: '#1c4532',
          2: '#166534',
          light: '#dcfce7',
        },
        accent: {
          DEFAULT: '#c2410c',
          light: '#fff7ed',
        },
        owner: { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
        broker: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
        flatmate: { bg: '#dbeafe', text: '#1e3a8a', dot: '#3b82f6' },
        city: {
          blr: '#be185d',
          hyd: '#b45309',
          gur: '#0f766e',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-outfit)', 'sans-serif'],
      },
      borderRadius: {
        r: '14px',
        r2: '20px',
        r3: '28px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(28,25,23,.09)',
        'card-lg': '0 12px 48px rgba(28,25,23,.14)',
      },
    },
  },
  plugins: [],
};
