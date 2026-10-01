// Homepage-scoped design tokens for the FIINNY ERP marketing site.
//
// These are deliberately kept OUT of the global CSS :root (index.css) so the
// ERP/dashboard theme is not affected. The homepage sections reference this
// object via inline styles — matching the existing landing components' idiom.

export const home = {
    font: {
        heading: "'Sora', 'Outfit', -apple-system, sans-serif",
        body: "'Outfit', -apple-system, sans-serif",
    },
    color: {
        // Greens — forest to bright emerald
        forestInk: '#08301E',
        forestDeep: '#0A3D26',
        forest: '#0F5132',
        emerald: '#1A9E67',
        emeraldSoft: '#E7F4EC',
        emeraldTint: 'rgba(26, 158, 103, 0.10)',
        // Harvest gold accent
        gold: '#E6A817',
        goldSoft: '#FBF0D9',
        // Warm neutrals / surfaces
        cream: '#FBFAF5',
        creamDeep: '#F4F1E8',
        surface: '#FFFFFF',
        // Text
        ink: '#12211A',
        body: '#4A5A52',
        muted: '#7C8A82',
        line: 'rgba(16, 45, 32, 0.10)',
        lineStrong: 'rgba(16, 45, 32, 0.16)',
        // On dark (forest) surfaces
        onDark: '#EAF3EC',
        onDarkMuted: 'rgba(234, 243, 236, 0.72)',
    },
    radius: { lg: '28px', md: '20px', sm: '14px', pill: '999px' },
    shadow: {
        card: '0 6px 28px -12px rgba(15, 81, 50, 0.16)',
        soft: '0 12px 44px -16px rgba(15, 81, 50, 0.20)',
        lift: '0 28px 64px -22px rgba(8, 48, 30, 0.30)',
    },
    maxW: 1200,
} as const;

// Shared section shell width helper.
export const container = {
    maxWidth: home.maxW,
    margin: '0 auto',
    width: '100%',
} as const;

// Small reusable eyebrow / section-label style.
export const eyebrow = {
    display: 'inline-block',
    color: home.color.emerald,
    fontFamily: home.font.body,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: '0.8rem',
};
