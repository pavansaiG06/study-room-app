import React from 'react';

export const LANDING_THEMES = {
  nocturne: {
    id: 'nocturne',
    label: 'Nocturne Gold',
    bg: '#06080f',
    surface: '#0d121f',
    cardBorder: 'rgba(226, 182, 109, 0.22)',
    primaryAccent: '#e2b66d',
    secondaryAccent: '#2dd4bf',
    ctaBg: 'linear-gradient(135deg, #e2b66d 0%, #ca8a3e 100%)',
    ctaText: '#090b10',
    pillBg: 'rgba(226, 182, 109, 0.12)',
    pillText: '#f5d9a6',
    swatch: 'linear-gradient(135deg, #e2b66d, #2dd4bf)'
  },
  botanical: {
    id: 'botanical',
    label: 'Botanical Sage',
    bg: '#050c0b',
    surface: '#0a1715',
    cardBorder: 'rgba(52, 211, 153, 0.24)',
    primaryAccent: '#34d399',
    secondaryAccent: '#38bdf8',
    ctaBg: 'linear-gradient(135deg, #34d399 0%, #0d9488 100%)',
    ctaText: '#04120f',
    pillBg: 'rgba(52, 211, 153, 0.12)',
    pillText: '#a7f3d0',
    swatch: 'linear-gradient(135deg, #34d399, #0ea5e9)'
  },
  nordic: {
    id: 'nordic',
    label: 'Nordic Slate',
    bg: '#070b14',
    surface: '#0e1525',
    cardBorder: 'rgba(96, 165, 250, 0.25)',
    primaryAccent: '#60a5fa',
    secondaryAccent: '#a78bfa',
    ctaBg: 'linear-gradient(135deg, #60a5fa 0%, #6366f1 100%)',
    ctaText: '#ffffff',
    pillBg: 'rgba(96, 165, 250, 0.14)',
    pillText: '#bfdbfe',
    swatch: 'linear-gradient(135deg, #60a5fa, #818cf8)'
  }
};

/**
 * Architectural atmospheric canvas specifically for the editorial Sign-In & Landing experience.
 */
export function AuthBackdrop({ themeId = 'nocturne' }) {
  const t = LANDING_THEMES[themeId] || LANDING_THEMES.nocturne;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none transition-colors duration-700"
      style={{ backgroundColor: t.bg }}
    >
      {/* Top Warm Editorial Spotlight */}
      <div
        className="absolute -top-48 left-1/2 -translate-x-1/2 w-[920px] h-[540px] rounded-full opacity-25 blur-[150px] transition-all duration-700"
        style={{ background: `radial-gradient(ellipse, ${t.primaryAccent} 0%, transparent 72%)` }}
      />

      {/* Bottom Balance Glow Behind Auth Portal */}
      <div
        className="absolute -bottom-56 right-[-10%] w-[680px] h-[680px] rounded-full opacity-20 blur-[150px] transition-all duration-700"
        style={{ background: `radial-gradient(circle, ${t.secondaryAccent} 0%, transparent 72%)` }}
      />

      {/* Masked Fine Architectural Grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 35%, #000 35%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 35%, #000 35%, transparent 100%)'
        }}
      />

      {/* Editorial Curved Horizon & Orbital Geometry */}
      <svg className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path
          d="M-80 280 C 320 140, 1080 420, 1520 220"
          stroke={t.primaryAccent}
          strokeOpacity="0.16"
          strokeWidth="1.25"
        />
        <path
          d="M-80 680 C 380 820, 960 540, 1520 710"
          stroke={t.secondaryAccent}
          strokeOpacity="0.14"
          strokeWidth="1.25"
        />
      </svg>
    </div>
  );
}
