export const ACTIVITY_STATUSES = {
  online: {
    id: 'online',
    label: 'Online',
    shortLabel: 'Online',
    desc: 'Visible and ready to study together',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
  },
  away: {
    id: 'away',
    label: 'Away',
    shortLabel: 'Away',
    desc: 'Idle or taking a short study break',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300'
  },
  busy: {
    id: 'busy',
    label: 'Busy (DND)',
    shortLabel: 'Busy',
    desc: 'Deep focus — mutes notification sounds & popups',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-400',
    badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300'
  },
  invisible: {
    id: 'invisible',
    label: 'Invisible',
    shortLabel: 'Invisible',
    desc: 'Appear offline to others while staying active',
    dotClass: 'bg-dark-900 border-2 border-slate-400',
    textClass: 'text-slate-400',
    badgeBg: 'bg-slate-500/15 border-slate-500/30 text-slate-300'
  },
  offline: {
    id: 'offline',
    label: 'Offline',
    shortLabel: 'Offline',
    desc: 'Currently offline',
    dotClass: 'bg-dark-900 border-2 border-slate-500',
    textClass: 'text-slate-500',
    badgeBg: 'bg-slate-500/10 border-slate-500/20 text-slate-400'
  }
};

export const STATUS_ORDER = ['online', 'away', 'busy', 'invisible'];

export function normalizeActivityMode(mode) {
  if (mode === 'available') return 'online';
  if (mode === 'break') return 'away';
  if (mode === 'focusing' || mode === 'dnd') return 'busy';
  if (['online', 'away', 'busy', 'invisible', 'offline'].includes(mode)) return mode;
  return 'online';
}

export function getActivityMeta(mode) {
  return ACTIVITY_STATUSES[normalizeActivityMode(mode)] || ACTIVITY_STATUSES.online;
}

export const PROFILE_THEMES = [
  { id: 'default', label: 'Midnight Glass', primary: '#1e1b4b', secondary: '#0f172a', accent: '#8b5cf6' },
  { id: 'aurora', label: 'Aurora Biolume', primary: '#0f766e', secondary: '#1e1b4b', accent: '#06b6d4' },
  { id: 'sunset', label: 'Sunset Synth', primary: '#7c2d12', secondary: '#581c87', accent: '#f97316' },
  { id: 'sakura', label: 'Sakura Velvet', primary: '#831843', secondary: '#311042', accent: '#ec4899' },
  { id: 'emerald', label: 'Emerald Grove', primary: '#064e3b', secondary: '#0f172a', accent: '#10b981' },
  { id: 'crimson', label: 'Crimson Edge', primary: '#7f1d1d', secondary: '#18181b', accent: '#ef4444' },
  { id: 'custom', label: 'Custom Dual-Color', primary: '#312e81', secondary: '#0f172a', accent: '#8b5cf6' }
];

export function getProfileThemeStyle(user) {
  const preset = PROFILE_THEMES.find((t) => t.id === user?.profile_theme);
  const primary = user?.theme_primary || preset?.primary || '#1e1b4b';
  const secondary = user?.theme_secondary || preset?.secondary || '#0f172a';
  const accent = user?.accent_color || preset?.accent || '#8b5cf6';
  return {
    background: `linear-gradient(155deg, ${primary}eb 0%, ${secondary}f5 58%, #090d16 100%)`,
    borderColor: `${accent}55`,
    accent
  };
}

export const AVATAR_FRAMES = [
  { id: 'none', label: 'Classic', ringClass: '' },
  { id: 'aurora', label: 'Aurora Halo', ringClass: 'ring-2 ring-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.55)]' },
  { id: 'royal', label: 'Royal Gold', ringClass: 'ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.55)]' },
  { id: 'crimson', label: 'Crimson Flame', ringClass: 'ring-2 ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.55)]' },
  { id: 'violet', label: 'Cosmic Violet', ringClass: 'ring-2 ring-purple-400 shadow-[0_0_12px_rgba(167,139,250,0.6)]' },
  { id: 'emerald', label: 'Neon Emerald', ringClass: 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.55)]' }
];

export function getAvatarFrameClass(frameId) {
  return AVATAR_FRAMES.find((f) => f.id === frameId)?.ringClass || '';
}

export const ROOM_ACCENT_PRESETS = [
  { label: 'Default Theme', hex: '' },
  { label: 'Violet', hex: '#8b5cf6' },
  { label: 'Teal', hex: '#14b8a6' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Cyan', hex: '#06b6d4' },
  { label: 'Rose', hex: '#f43f5e' },
  { label: 'Emerald', hex: '#22c55e' },
  { label: 'Gold', hex: '#eab308' }
];

export const ROOM_THEMES = {
  default: {
    id: 'default',
    label: 'Obsidian Nebula',
    defaultAccent: '#8b5cf6',
    canvasBg: 'linear-gradient(145deg, #0b0f1e 0%, #141933 48%, #070a14 100%)',
    secondaryGlow: '#3b82f6',
    pattern: 'dots',
    headerBg: 'rgba(13, 18, 34, 0.88)',
    headerClass: 'border-white/15',
    bgGradient: 'from-indigo-950/70 via-slate-950/60 to-dark-950/80',
    badgeClass: 'bg-brand-purple/20 text-purple-300 border-brand-purple/30',
    swatch: 'linear-gradient(135deg, #1e1b4b, #0f172a)'
  },
  'lofi-purple': {
    id: 'lofi-purple',
    label: 'Twilight Lofi Studio',
    defaultAccent: '#d946ef',
    canvasBg: 'linear-gradient(140deg, #1e0b36 0%, #2f124c 45%, #160a28 100%)',
    secondaryGlow: '#f43f5e',
    pattern: 'horizon',
    headerBg: 'rgba(34, 15, 58, 0.88)',
    headerClass: 'border-fuchsia-400/25',
    bgGradient: 'from-purple-950/70 via-fuchsia-950/50 to-indigo-950/70',
    badgeClass: 'bg-purple-500/25 text-purple-200 border-purple-400/40',
    swatch: 'linear-gradient(135deg, #581c87, #be185d)'
  },
  'forest-calm': {
    id: 'forest-calm',
    label: 'Kyoto Pine Rain',
    defaultAccent: '#10b981',
    canvasBg: 'linear-gradient(155deg, #041e18 0%, #0a342a 48%, #051314 100%)',
    secondaryGlow: '#0d9488',
    pattern: 'rays',
    headerBg: 'rgba(6, 36, 29, 0.90)',
    headerClass: 'border-emerald-400/25',
    bgGradient: 'from-emerald-950/70 via-teal-950/50 to-dark-950/70',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
    swatch: 'linear-gradient(135deg, #065f46, #0f766e)'
  },
  'ocean-deep': {
    id: 'ocean-deep',
    label: 'Abyssal Ocean',
    defaultAccent: '#06b6d4',
    canvasBg: 'linear-gradient(160deg, #041628 0%, #082c47 50%, #050f1d 100%)',
    secondaryGlow: '#2563eb',
    pattern: 'waves',
    headerBg: 'rgba(8, 31, 51, 0.90)',
    headerClass: 'border-cyan-400/25',
    bgGradient: 'from-cyan-950/70 via-sky-950/50 to-slate-950/70',
    badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
    swatch: 'linear-gradient(135deg, #0e7490, #1e3a8a)'
  },
  'sunset-warm': {
    id: 'sunset-warm',
    label: 'Amber Espresso Café',
    defaultAccent: '#f59e0b',
    canvasBg: 'linear-gradient(150deg, #271308 0%, #3e1d0d 46%, #180b0a 100%)',
    secondaryGlow: '#ea580c',
    pattern: 'bokeh',
    headerBg: 'rgba(42, 18, 10, 0.90)',
    headerClass: 'border-amber-400/25',
    bgGradient: 'from-amber-950/70 via-orange-950/50 to-rose-950/70',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    swatch: 'linear-gradient(135deg, #b45309, #9f1239)'
  },
  'crimson-focus': {
    id: 'crimson-focus',
    label: 'Crimson Pomodoro',
    defaultAccent: '#f43f5e',
    canvasBg: 'linear-gradient(145deg, #240710 0%, #3d0c19 48%, #13050a 100%)',
    secondaryGlow: '#dc2626',
    pattern: 'grid',
    headerBg: 'rgba(40, 11, 18, 0.90)',
    headerClass: 'border-rose-400/25',
    bgGradient: 'from-rose-950/70 via-red-950/50 to-zinc-950/70',
    badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
    swatch: 'linear-gradient(135deg, #9f1239, #450a0a)'
  },
  'aurora-nord': {
    id: 'aurora-nord',
    label: 'Northern Aurora',
    defaultAccent: '#2dd4bf',
    canvasBg: 'linear-gradient(155deg, #071b24 0%, #102a3b 45%, #161533 100%)',
    secondaryGlow: '#a855f7',
    pattern: 'aurora',
    headerBg: 'rgba(12, 34, 46, 0.90)',
    headerClass: 'border-teal-400/25',
    bgGradient: 'from-teal-950/60 via-slate-900/50 to-indigo-950/70',
    badgeClass: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
    swatch: 'linear-gradient(135deg, #0d9488, #4f46e5)'
  },
  'minimal-slate': {
    id: 'minimal-slate',
    label: 'Clean Monochrome Desk',
    defaultAccent: '#94a3b8',
    canvasBg: 'linear-gradient(160deg, #111318 0%, #1a1d24 50%, #090b0f 100%)',
    secondaryGlow: '#64748b',
    pattern: 'blueprint',
    headerBg: 'rgba(20, 23, 30, 0.92)',
    headerClass: 'border-slate-400/20',
    bgGradient: 'from-zinc-900/70 via-slate-900/60 to-neutral-950/80',
    badgeClass: 'bg-slate-500/20 text-slate-200 border-slate-400/35',
    swatch: 'linear-gradient(135deg, #334155, #0f172a)'
  }
};

export function getRoomThemeVisuals(room) {
  const theme = ROOM_THEMES[room?.theme] || ROOM_THEMES.default;
  const customAccent = /^#[0-9a-fA-F]{6}$/.test(room?.theme_accent || '') ? room.theme_accent : '';
  const accent = customAccent || theme.defaultAccent;
  const secondaryGlow = customAccent || theme.secondaryGlow;
  return {
    theme,
    accent,
    secondaryGlow,
    canvasBg: theme.canvasBg,
    headerStyle: {
      backgroundColor: theme.headerBg,
      borderColor: `${accent}55`,
      boxShadow: `0 12px 32px -12px ${accent}33`
    },
    stageBorderStyle: {
      borderColor: `${accent}40`,
      boxShadow: `inset 0 0 80px -30px ${accent}25`
    }
  };
}
