import React, { useState, useEffect } from 'react';
import { Sparkles, Check, ArrowRight, AtSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { compressBannerImage } from '../utils/image';
import {
  ACTIVITY_STATUSES,
  STATUS_ORDER,
  PROFILE_THEMES,
  AVATAR_FRAMES,
  getActivityMeta,
  getProfileThemeStyle
} from '../utils/themes';

const BANNER_COLORS = ['#1e1b4b', '#0f172a', '#3b0764', '#042f2e', '#451a03', '#831843'];

export function ProfileOnboardingModal({ isOpen, onClose }) {
  const { user, updateProfile } = useAuth();
  const { addToast } = useToast();

  const [username, setUsername] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [customEmoji, setCustomEmoji] = useState('📚');
  const [statusText, setStatusText] = useState('Ready to focus');
  const [statusMode, setStatusMode] = useState('online');
  const [profileTheme, setProfileTheme] = useState('default');
  const [themePrimary, setThemePrimary] = useState('#1e1b4b');
  const [themeSecondary, setThemeSecondary] = useState('#0f172a');
  const [accentColor, setAccentColor] = useState('#8b5cf6');
  const [bannerColor, setBannerColor] = useState('#1e1b4b');
  const [bannerUrl, setBannerUrl] = useState(null);
  const [avatarFrame, setAvatarFrame] = useState('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setUsername(user.username || '');
      setPronouns(user.pronouns || '');
      setBio(user.bio || '');
      setCustomEmoji(user.custom_emoji || '📚');
      setStatusText(user.status_text || '');
      setStatusMode(user.status_mode || 'online');
      setProfileTheme(user.profile_theme || 'default');
      setThemePrimary(user.theme_primary || '#1e1b4b');
      setThemeSecondary(user.theme_secondary || '#0f172a');
      setAccentColor(user.accent_color || '#8b5cf6');
      setBannerColor(user.banner_color || '#1e1b4b');
      setBannerUrl(user.banner_url || null);
      setAvatarFrame(user.avatar_frame || 'none');
    }
  }, [isOpen, user?.id]);

  if (!isOpen || !user || user.is_guest) return null;

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressBannerImage(file);
      setBannerUrl(compressed);
    } catch (err) {
      addToast(err.message || 'Could not process banner', 'error');
    }
    e.target.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        username: username.trim(),
        pronouns: pronouns.trim(),
        bio: bio.trim(),
        custom_emoji: customEmoji.trim(),
        status_text: statusText.trim(),
        status_mode: statusMode,
        profile_theme: profileTheme,
        theme_primary: themePrimary,
        theme_secondary: themeSecondary,
        accent_color: accentColor,
        banner_color: bannerColor,
        banner_url: bannerUrl,
        avatar_frame: avatarFrame
      });
      addToast('Profile customized! Welcome to StudyHub.', 'success');
      onClose();
    } catch (err) {
      addToast(err.message || 'Could not save customization', 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewTheme = getProfileThemeStyle({
    profile_theme: profileTheme,
    theme_primary: themePrimary,
    theme_secondary: themeSecondary,
    accent_color: accentColor
  });
  const activeStatusMeta = getActivityMeta(statusMode);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2.5 sm:p-6 bg-black/80 backdrop-blur-md modal-backdrop-enter">
      <div className="glass-panel modal-panel-enter w-full max-w-4xl rounded-3xl border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 bg-gradient-to-r from-brand-purple/20 via-dark-950/60 to-brand-blue/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-purple/25 text-brand-purple flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Step 2: Customize Your StudyHub Profile</h2>
              <p className="text-xs text-slate-400">Personalize your banner, dual-color theme, avatar frame, and study bio.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10"
          >
            Skip for now
          </button>
        </div>

        {/* Form + Live Preview */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Username Handle</label>
                <div className="relative">
                  <AtSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="study_star"
                    maxLength={24}
                    className="w-full glass-input pl-8 pr-3 py-2 rounded-xl text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Pronouns</label>
                <input
                  type="text"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g. she/her, they/them"
                  maxLength={24}
                  className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">About Me / Bio</label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="CS major prepping algorithms, lofi enthusiast..."
                maxLength={200}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm resize-none"
              />
            </div>

            {/* Banner Picker */}
            <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Profile Banner</span>
                <label className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-white cursor-pointer">
                  Upload Banner Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                </label>
              </div>
              <div className="flex gap-2">
                {BANNER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setBannerColor(c);
                      setBannerUrl(null);
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-lg border ${
                      bannerColor === c && !bannerUrl ? 'border-white scale-110' : 'border-white/15 opacity-75'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Profile Card Theme Presets */}
            <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/10 space-y-2">
              <span className="text-xs font-semibold text-slate-200 block">Profile Card Theme</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROFILE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setProfileTheme(t.id);
                      if (t.id !== 'custom') {
                        setThemePrimary(t.primary);
                        setThemeSecondary(t.secondary);
                        setAccentColor(t.accent);
                      }
                    }}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 ${
                      profileTheme === t.id ? 'border-white bg-white/10 text-white' : 'border-white/10 bg-dark-950/50 text-slate-400'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded flex-shrink-0 border border-white/20"
                      style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}
                    />
                    <span className="text-[11px] font-semibold truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Avatar Frame */}
            <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/10 space-y-2">
              <span className="text-xs font-semibold text-slate-200 block">Avatar Frame</span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {AVATAR_FRAMES.map((frame) => (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => setAvatarFrame(frame.id)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                      avatarFrame === frame.id ? 'border-brand-purple bg-brand-purple/20 text-white' : 'border-white/10 bg-dark-950/60 text-slate-400'
                    }`}
                  >
                    <UserAvatar name={user.name} avatarUrl={user.avatar_url} avatarColor={user.avatar_color} avatarFrame={frame.id} sizeClass="w-7 h-7 text-[10px]" />
                    <span className="text-[10px] truncate w-full text-center">{frame.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Mode & Status */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Emoji</label>
                <input
                  type="text"
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  maxLength={4}
                  className="w-full glass-input px-2 py-2 rounded-xl text-sm text-center"
                />
              </div>
              <div className="col-span-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Activity</label>
                <select
                  value={statusMode}
                  onChange={(e) => setStatusMode(e.target.value)}
                  className="w-full glass-input px-2 py-2 rounded-xl text-xs bg-dark-900 text-white"
                >
                  {STATUS_ORDER.map((m) => (
                    <option key={m} value={m}>{ACTIVITY_STATUSES[m].shortLabel}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status Note</label>
                <input
                  type="text"
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Studying..."
                  maxLength={60}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>

          {/* Right: Live Profile Card Preview + Save CTA */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Live Profile Preview
              </div>
              <div
                className="rounded-2xl overflow-hidden border shadow-xl"
                style={{ background: previewTheme.background, borderColor: previewTheme.borderColor }}
              >
                <div
                  className="h-24 w-full bg-cover bg-center"
                  style={{
                    backgroundColor: bannerColor,
                    backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined
                  }}
                />
                <div className="px-4 pb-4">
                  <div className="-mt-8 mb-2 flex items-end justify-between">
                    <div className="p-1 rounded-full bg-dark-950">
                      <UserAvatar
                        name={user.name}
                        avatarUrl={user.avatar_url}
                        avatarColor={user.avatar_color}
                        avatarFrame={avatarFrame}
                        sizeClass="w-16 h-16 text-lg"
                        statusMode={statusMode}
                      />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1 ${activeStatusMeta.badgeBg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${activeStatusMeta.dotClass}`} />
                      {activeStatusMeta.shortLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base">{user.name}</span>
                    {pronouns && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300">{pronouns}</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {username ? `@${username}` : 'Member'}
                  </div>

                  {(customEmoji || statusText) && (
                    <div className="mt-2 px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5">
                      <span>{customEmoji}</span>
                      <span>{statusText}</span>
                    </div>
                  )}

                  {bio && (
                    <p className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-200/90 leading-relaxed">
                      {bio}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-brand-purple/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving Profile...' : 'Save Profile & Enter StudyHub'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
