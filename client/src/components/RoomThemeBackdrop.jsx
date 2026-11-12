import React from 'react';
import { getRoomThemeVisuals } from '../utils/themes';

/**
 * Full-bleed themed environment canvas inside Study Rooms.
 * Replaces the 3D particle canvas when inside a call so each theme + custom accent shines clearly.
 */
export function RoomThemeBackdrop({ room }) {
  const { theme, accent, secondaryGlow, canvasBg } = getRoomThemeVisuals(room);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none transition-all duration-700"
      style={{ background: canvasBg }}
    >
      {/* Primary & Custom Accent Ambient Glow */}
      <div
        className="absolute -top-36 -left-32 w-[680px] h-[680px] rounded-full opacity-30 blur-[140px] transition-colors duration-700"
        style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 72%)` }}
      />
      <div
        className="absolute -bottom-44 -right-28 w-[640px] h-[640px] rounded-full opacity-25 blur-[140px] transition-colors duration-700"
        style={{ background: `radial-gradient(circle, ${secondaryGlow} 0%, transparent 72%)` }}
      />

      {/* Distinct Theme Texture Patterns */}
      {theme.pattern === 'dots' && (
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: `radial-gradient(${accent}55 1px, transparent 1px)`,
            backgroundSize: '28px 28px'
          }}
        />
      )}

      {(theme.pattern === 'grid' || theme.pattern === 'blueprint') && (
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `linear-gradient(to right, ${accent}33 1px, transparent 1px), linear-gradient(to bottom, ${accent}33 1px, transparent 1px)`,
            backgroundSize: theme.pattern === 'blueprint' ? '32px 32px' : '44px 44px'
          }}
        />
      )}

      {theme.pattern === 'rays' && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `repeating-linear-gradient(125deg, transparent 0px, transparent 70px, ${accent}22 70px, ${accent}22 96px)`
          }}
        />
      )}

      {theme.pattern === 'bokeh' && (
        <>
          <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-[90px] opacity-20" style={{ background: accent }} />
          <div className="absolute bottom-1/4 left-1/2 w-96 h-96 rounded-full blur-[110px] opacity-15" style={{ background: '#fb923c' }} />
        </>
      )}

      {(theme.pattern === 'waves' || theme.pattern === 'aurora' || theme.pattern === 'horizon') && (
        <svg className="absolute inset-0 w-full h-full opacity-45" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
          <path
            d="M-60 640 C 260 540, 560 760, 910 620 C 1170 520, 1340 650, 1500 580"
            stroke={accent}
            strokeOpacity="0.28"
            strokeWidth="2"
          />
          <path
            d="M-60 720 C 310 810, 620 620, 980 735 C 1220 805, 1370 690, 1500 720"
            stroke={secondaryGlow}
            strokeOpacity="0.22"
            strokeWidth="1.5"
          />
          {theme.pattern === 'horizon' && (
            <circle cx="720" cy="480" r="260" stroke={accent} strokeOpacity="0.16" strokeWidth="1.5" strokeDasharray="8 10" />
          )}
        </svg>
      )}

      {/* Subtle Soft Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at center, transparent 42%, rgba(2, 4, 10, 0.55) 100%)' }}
      />
    </div>
  );
}
