import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Sparkles,
  Mail,
  Lock,
  User,
  ArrowRight,
  ArrowDown,
  Camera,
  Trash2,
  Eye,
  EyeOff,
  Video,
  PenTool,
  CloudRain,
  ShieldCheck,
  ShieldAlert,
  Users,
  Music2,
  Palette,
  Pause,
  Play,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { AuthBackdrop, LANDING_THEMES } from './AuthBackdrop';
import { AppealModal } from './AppealModal';
import { compressAvatarImage } from '../utils/image';

const AVATAR_COLORS = ['#e2b66d', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185', '#22d3ee'];

function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: 'bg-slate-700' };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-400' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-emerald-400' };
  return { score: 4, label: 'Strong', color: 'bg-cyan-400' };
}

export function LandingAuthPage({ onSignedUp }) {
  const { login, register, guestLogin } = useAuth();
  const { addToast } = useToast();

  const [landingThemeId, setLandingThemeId] = useState(
    () => localStorage.getItem('studyhub_landing_theme') || 'nocturne'
  );
  const [motionPaused, setMotionPaused] = useState(false);

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'guest'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAppealModal, setShowAppealModal] = useState(false);

  const pageRef = useRef(null);
  const authPortalRef = useRef(null);
  const theme = LANDING_THEMES[landingThemeId] || LANDING_THEMES.nocturne;
  const strength = getPasswordStrength(password);

  useEffect(() => {
    localStorage.setItem('studyhub_landing_theme', landingThemeId);
  }, [landingThemeId]);

  // Progressive enhancement fallback for browsers without native CSS scroll-driven view() timelines
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const targets = root.querySelectorAll('.scroll-reveal-card');

    const supportsViewTimeline =
      typeof CSS !== 'undefined' &&
      CSS.supports('(animation-timeline: view()) and (animation-range: entry)');
    const noReducedMotion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

    if (supportsViewTimeline || !noReducedMotion) return;

    targets.forEach((el) => el.classList.add('scroll-reveal-fallback'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-revealed', 'true');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const scrollToAuth = (preferredMode = null) => {
    if (preferredMode) {
      setMode(preferredMode);
      setError('');
    }
    authPortalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarImage(file);
      setAvatarUrl(compressed);
    } catch (err) {
      setError(err.message || 'Could not process profile picture');
    }
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!email.trim() || !password) throw new Error('Email and password are required');
        const loggedUser = await login(email.trim(), password);
        addToast(
          loggedUser?.is_admin
            ? `Welcome back, Administrator (${loggedUser.name})`
            : `Welcome back, ${loggedUser.name}!`,
          'success'
        );
      } else if (mode === 'register') {
        if (!name.trim() || !email.trim() || !password) {
          throw new Error('Please fill in your display name, email, and password');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }
        await register(email.trim(), password, name.trim(), avatarColor, avatarUrl);
        addToast('Account created! Customize your profile next.', 'success');
        onSignedUp?.();
      } else if (mode === 'guest') {
        const guestName = name.trim() || `Student_${Math.floor(1000 + Math.random() * 9000)}`;
        await guestLogin(guestName, avatarColor, avatarUrl);
        addToast(`Entered as Guest (${guestName}) — Limited access mode`, 'info', 4500);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={pageRef}
      className={`min-h-[100dvh] w-full relative z-10 text-slate-100 ${motionPaused ? 'motion-paused' : ''}`}
    >
      <AuthBackdrop themeId={landingThemeId} />

      {/* Minimal Editorial Sticky Top Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-white/10 bg-black/45 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: theme.ctaBg, color: theme.ctaText }}
            >
              <Box className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block leading-none">
                StudyHub
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: theme.primaryAccent }}>
                Focus Sanctuary
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-300">
            <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
            <a href="#atmosphere" className="hover:text-white transition-colors">Rooms &amp; Audio</a>
            <a href="#safety" className="hover:text-white transition-colors">Community Safety</a>
            <button type="button" onClick={() => scrollToAuth('login')} className="hover:text-white transition-colors">
              Sign In
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Editorial Page Theme Switcher (Desktop pills + Mobile compact cycler) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10">
              <Palette className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
              {Object.values(LANDING_THEMES).map((lt) => (
                <button
                  key={lt.id}
                  type="button"
                  onClick={() => setLandingThemeId(lt.id)}
                  title={`Theme: ${lt.label}`}
                  className={`btn-tactile w-4 h-4 rounded-full transition-transform ${
                    landingThemeId === lt.id ? 'scale-125 ring-2 ring-white' : 'opacity-65 hover:opacity-100'
                  }`}
                  style={{ background: lt.swatch }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const keys = Object.keys(LANDING_THEMES);
                const next = keys[(keys.indexOf(landingThemeId) + 1) % keys.length];
                setLandingThemeId(next);
              }}
              title={`Theme: ${theme.label} (tap to cycle)`}
              className="sm:hidden touch-control btn-tactile p-2 rounded-full border border-white/10 bg-white/5 text-slate-200 hover:text-white transition-colors"
            >
              <Palette className="w-4 h-4" style={{ color: theme.primaryAccent }} />
            </button>

            <button
              type="button"
              onClick={() => setMotionPaused((p) => !p)}
              title={motionPaused ? 'Resume subtle animations' : 'Pause animations'}
              className="touch-control btn-tactile p-2 rounded-full border border-white/10 bg-white/5 text-slate-300 hover:text-white transition-colors"
            >
              {motionPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => scrollToAuth('login')}
              className="btn-tactile touch-control px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold shadow-lg transition-transform hover:scale-[1.03] flex items-center gap-1.5"
              style={{ background: theme.ctaBg, color: theme.ctaText }}
            >
              Sign In
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* SECTION 1: HERO EDITORIAL LANDING */}
      <main>
      <section className="relative pt-16 sm:pt-24 pb-20 px-4 sm:px-8 max-w-5xl mx-auto text-center space-y-8">
        <div
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-xs font-semibold border mx-auto"
          style={{
            backgroundColor: theme.pillBg,
            borderColor: theme.cardBorder,
            color: theme.pillText
          }}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          StudyHub · Distraction-Free Study Room App &amp; Live Accountability
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.06] max-w-4xl mx-auto">
          Where deep work feels{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(120deg, ${theme.primaryAccent}, ${theme.secondaryAccent})`
            }}
          >
            effortlessly calm.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Your calm online study hub &amp; virtual study room app — free from noisy chat servers and sterile meeting links.
          Enter custom-themed study rooms built around live video co-working, synchronized whiteboards,
          YouTube study music detection, and daily focus streaks.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          <button
            type="button"
            onClick={() => scrollToAuth('register')}
            className="px-7 py-3.5 rounded-full font-bold text-sm shadow-xl transition-transform hover:scale-[1.03] flex items-center gap-2"
            style={{ background: theme.ctaBg, color: theme.ctaText }}
          >
            Get Started Free
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollToAuth('login')}
            className="px-7 py-3.5 rounded-full font-bold text-sm border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-colors"
          >
            Sign In to Account
          </button>
          <button
            type="button"
            onClick={() => scrollToAuth('guest')}
            className="px-5 py-3.5 rounded-full font-semibold text-sm text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <Users className="w-4 h-4" style={{ color: theme.primaryAccent }} />
            Try Guest Preview
          </button>
        </div>

        {/* Live Editorial Preview Strip */}
        <div
          className="mt-10 mx-auto max-w-3xl rounded-3xl border p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left shadow-2xl"
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.cardBorder
          }}
        >
          <div className="p-3.5 rounded-2xl bg-black/35 border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/15 text-emerald-300 flex-shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Focus Timer</div>
              <div className="text-sm font-bold text-white">50m Deep Block</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/35 border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-300 flex-shrink-0">
              <Music2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                YouTube Song
                <span className="inline-flex items-end gap-0.5 h-2.5">
                  <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-1" />
                  <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-2" />
                  <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-3" />
                </span>
              </div>
              <div className="text-xs font-bold text-white truncate">Midnight Rain — Lofi Trio</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/35 border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-500/15 text-sky-300 flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Room Security</div>
              <div className="text-sm font-bold text-white">Verified &amp; Moderated</div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: SCROLL-DRIVEN WORKFLOW BENTO */}
      <section id="workflow" className="py-16 sm:py-24 px-4 sm:px-8 max-w-6xl mx-auto space-y-10">
        <div className="scroll-reveal-card text-center max-w-2xl mx-auto space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: theme.primaryAccent }}>
            Crafted For Sustained Attention
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Everything you need in one cohesive study ritual
          </h2>
          <p className="text-sm text-slate-400">
            Scroll through the sanctuary spaces designed to keep peers connected without visual clutter.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Video,
              title: 'HD Video & Co-Working',
              desc: 'Green room camera check, layout switching, speaker focus, and crystal-clear WebRTC calls.'
            },
            {
              icon: PenTool,
              title: 'Shared Board & Goals',
              desc: 'Collaborate on live whiteboards, check off room study targets, and build daily streaks.'
            },
            {
              icon: CloudRain,
              title: 'Themed Atmospheres',
              desc: '8 calm room environments with custom accent colors plus layered rain, café & lofi soundscapes.'
            },
            {
              icon: Music2,
              title: 'Song Detection & Presence',
              desc: 'Paste a YouTube link to automatically detect music tracks and display them live on your tile.'
            }
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="scroll-reveal-card rounded-3xl border p-6 space-y-3 shadow-xl transition-transform hover:-translate-y-1"
                style={{ backgroundColor: theme.surface, borderColor: theme.cardBorder }}
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: theme.pillBg, color: theme.primaryAccent }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">{card.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: SCROLL-PARALLAX ATMOSPHERE & SAFETY SHOWCASE */}
      <section id="atmosphere" className="py-12 px-4 sm:px-8 max-w-6xl mx-auto">
        <div
          className="scroll-reveal-card scroll-parallax-band rounded-3xl border p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${theme.surface} 0%, rgba(10,14,26,0.96) 100%)`,
            borderColor: theme.cardBorder
          }}
        >
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: theme.secondaryAccent }}>
              <Sparkles className="w-4 h-4" /> Custom Room Environments
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              Zero distracting particles inside calls. Full room mood customization.
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every study room supports dedicated visual themes — from <strong>Kyoto Pine Rain</strong> and{' '}
              <strong>Amber Espresso Café</strong> to <strong>Northern Aurora</strong> — enhanced with any
              custom accent color your host selects.
            </p>
          </div>

          <div id="safety" className="lg:col-span-5 space-y-3">
            {[
              ['Anti-Bot Guest Isolation', 'Guests can watch public study spaces safely while chat, video, and links stay locked.'],
              ['Waiting Rooms & Room Roles', 'Room owners promote admins, approve knocks, and moderate sessions live.'],
              ['Account Controls & Data Privacy', 'Full profile customization, JSON data export, device revocation, and instant account deletion.']
            ].map(([title, body]) => (
              <div key={title} className="p-3.5 rounded-2xl bg-black/35 border border-white/10">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: theme.primaryAccent }} />
                  {title}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: CENTERED SIGN-IN / SIGN-UP / GUEST PORTAL (FOCAL FINALE) */}
      <section
        id="auth-portal"
        ref={authPortalRef}
        className="scroll-reveal-card py-20 sm:py-28 px-4 sm:px-8 relative"
      >
        {/* Soft Halo Centered Behind Auth Card */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full opacity-20 blur-[130px] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${theme.primaryAccent} 0%, transparent 70%)` }}
        />

        <div className="relative z-10 max-w-lg mx-auto text-center mb-8 space-y-2">
          <div className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: theme.primaryAccent }}>
            Enter StudyHub
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Step into your workspace
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Sign in, create a free customizable profile, or explore with a limited Guest Pass.
          </p>
        </div>

        <div
          className="relative z-10 w-full max-w-md mx-auto p-6 sm:p-8 rounded-3xl border shadow-2xl backdrop-blur-2xl"
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.cardBorder,
            boxShadow: `0 30px 90px -20px rgba(0, 0, 0, 0.85), 0 0 0 1px ${theme.cardBorder}`
          }}
        >
          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/45 border border-white/10 mb-6">
            {[
              ['login', 'Sign In'],
              ['register', 'Sign Up'],
              ['guest', 'Guest']
            ].map(([mId, label]) => {
              const active = mode === mId;
              return (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    setMode(mId);
                    setError('');
                  }}
                  style={
                    active
                      ? { background: theme.ctaBg, color: theme.ctaText }
                      : undefined
                  }
                  className={`btn-tactile min-h-[40px] py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    active ? 'shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mId === 'guest' && <Sparkles className="w-3.5 h-3.5" />}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mb-5 text-center">
            <h3 className="text-xl font-bold text-white">
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create your free account'}
              {mode === 'guest' && 'Continue with Guest Pass'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {mode === 'login' && 'Sign in to access your study rooms, friends, streaks & settings.'}
              {mode === 'register' && 'Register first, then personalize your banner, theme & avatar.'}
              {mode === 'guest' && 'Quick view-only room preview — no password needed.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span className="flex-1">{error}</span>
              </div>
              {error.toLowerCase().includes('banned') && (
                <button
                  type="button"
                  onClick={() => setShowAppealModal(true)}
                  className="self-start px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Appeal Ban / Message Administrator
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(mode === 'register' || mode === 'guest') && (
              <>
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-black/40 border border-white/10">
                  <div className="relative group">
                    <UserAvatar
                      name={name || 'SH'}
                      avatarUrl={avatarUrl}
                      avatarColor={avatarColor}
                      sizeClass="w-14 h-14 text-base"
                    />
                    <label className="absolute inset-0 rounded-full bg-black/50 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <Camera className="w-4 h-4 text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-white cursor-pointer inline-flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5" style={{ color: theme.primaryAccent }} />
                        {avatarUrl ? 'Change Photo' : 'Upload Avatar'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl(null)}
                          className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/15"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {AVATAR_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setAvatarColor(color)}
                          style={{ backgroundColor: color }}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            avatarColor === color ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Display Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                    <input
                      type="text"
                      required={mode === 'register'}
                      placeholder={mode === 'guest' ? 'e.g. Alex (optional)' : 'Your display name'}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                      maxLength={35}
                    />
                  </div>
                </div>
              </>
            )}

            {(mode === 'login' || mode === 'register') && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full glass-input pl-10 pr-10 py-2.5 rounded-xl text-sm"
                      minLength={mode === 'register' ? 6 : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {mode === 'register' && password && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 grid grid-cols-4 gap-1 h-1.5">
                        {[1, 2, 3, 4].map((lvl) => (
                          <div
                            key={lvl}
                            className={`rounded-full ${
                              strength.score >= lvl ? strength.color : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-300">{strength.label}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {mode === 'guest' && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1.5 text-[11px] text-amber-100">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Anti-Spam Guest Safeguards
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Guests can join rooms by code, listen in, use Pomodoro, Tasks, Notes, and Soundscapes.{' '}
                  <strong className="text-white">Room chat, camera, screen sharing, link sharing &amp; DMs</strong>{' '}
                  are locked to registered accounts.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ background: theme.ctaBg, color: theme.ctaText }}
              className="btn-tactile min-h-[44px] w-full py-3 px-4 rounded-xl hover:opacity-95 font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Connecting...</span>
              ) : (
                <>
                  <span>
                    {mode === 'login'
                      ? 'Sign In to Workspace'
                      : mode === 'register'
                      ? 'Create Account & Customize Profile'
                      : 'Enter as Guest'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {mode !== 'guest' && (
            <div className="mt-5 pt-4 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('guest');
                  setError('');
                }}
                className="btn-tactile touch-control px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5" style={{ color: theme.primaryAccent }} />
                Skip sign in and proceed as Guest &rarr;
              </button>
            </div>
          )}
        </div>
      </section>
      </main>

      <footer className="pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2 px-4 text-center text-[11px] text-slate-500">
        StudyHub Sanctuary · Focused co-study rooms, live accountability, and verified community moderation.
      </footer>

      <AppealModal
        isOpen={showAppealModal}
        onClose={() => setShowAppealModal(false)}
        userEmail={email}
      />
    </div>
  );
}