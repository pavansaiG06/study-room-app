import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Shield,
  Mic,
  Palette,
  Bell,
  Keyboard,
  Lock,
  Camera,
  Trash2,
  Check,
  LogOut,
  Sparkles,
  Volume2,
  Video,
  AtSign,
  Mail,
  Image as ImageIcon,
  Download,
  AlertTriangle,
  Pipette
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { compressAvatarImage, compressBannerImage } from '../utils/image';
import {
  ACTIVITY_STATUSES,
  STATUS_ORDER,
  PROFILE_THEMES,
  AVATAR_FRAMES,
  normalizeActivityMode,
  getActivityMeta,
  getProfileThemeStyle
} from '../utils/themes';

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];
const BANNER_COLORS = ['#1e1b4b', '#0f172a', '#3b0764', '#042f2e', '#451a03', '#831843'];
const ACCENT_THEMES = [
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Ocean', color: '#3b82f6' },
  { name: 'Rose', color: '#ec4899' },
  { name: 'Emerald', color: '#22c55e' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Amber', color: '#f59e0b' }
];

export function UserSettingsModal({ isOpen, onClose, onOpenBgSettings }) {
  const { user, token, updateProfile, upgradeGuest, changePassword, logoutAllOtherSessions, deleteAccount, logout } = useAuth();
  const {
    selectedMicId,
    setSelectedMicId,
    selectedCamId,
    setSelectedCamId,
    selectedSpeakerId,
    setSelectedSpeakerId,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGain,
    setAutoGain,
    inputMode,
    setInputMode,
    pttKey,
    setPttKey,
    vadThreshold,
    setVadThreshold,
    soundboardVolume,
    setSoundboardVolume,
    blurBackground,
    setBlurBackground,
    chatDensity,
    setChatDensity,
    selfViewMode,
    setSelfViewMode,
    skipGreenRoom,
    setSkipGreenRoom
  } = useMediaSettings();
  const { addToast } = useToast();

  const [section, setSection] = useState('profile'); // 'account' | 'profile' | 'voice' | 'appearance' | 'notifications' | 'keybinds' | 'privacy' | 'upgrade'

  // Profile fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [statusMode, setStatusMode] = useState('online');
  const [statusText, setStatusText] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarFrame, setAvatarFrame] = useState('none');
  const [bannerColor, setBannerColor] = useState('#1e1b4b');
  const [bannerUrl, setBannerUrl] = useState(null);
  const [accentColor, setAccentColor] = useState('#8b5cf6');
  const [profileTheme, setProfileTheme] = useState('default');
  const [themePrimary, setThemePrimary] = useState('#1e1b4b');
  const [themeSecondary, setThemeSecondary] = useState('#0f172a');

  // Preferences & Privacy
  const [pomoWork, setPomoWork] = useState(25);
  const [pomoBreak, setPomoBreak] = useState(5);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showBioPrivacy, setShowBioPrivacy] = useState('everyone');
  const [allowDMs, setAllowDMs] = useState('everyone');
  const [allowFriendRequests, setAllowFriendRequests] = useState('everyone');

  // Account & Security
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Guest upgrade
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');

  // Voice & Video Test
  const [devices, setDevices] = useState({ mics: [], cams: [], speakers: [] });
  const [testingAudio, setTestingAudio] = useState(false);
  const [testingVideo, setTestingVideo] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const testVideoRef = useRef(null);
  const testStreamRef = useRef(null);
  const testAudioRef = useRef(null);

  const [saving, setSaving] = useState(false);

  // Sync user data when opened
  useEffect(() => {
    if (isOpen && user) {
      setSection('profile');
      setName(user.name || '');
      setUsername(user.username || '');
      setPronouns(user.pronouns || '');
      setBio(user.bio || '');
      setStatusMode(normalizeActivityMode(user.status_mode));
      setStatusText(user.status_text || '');
      setCustomEmoji(user.custom_emoji || '');
      setAvatarColor(user.avatar_color || AVATAR_COLORS[0]);
      setAvatarUrl(user.avatar_url || null);
      setAvatarFrame(user.avatar_frame || 'none');
      setBannerColor(user.banner_color || '#1e1b4b');
      setBannerUrl(user.banner_url || null);
      setAccentColor(user.accent_color || '#8b5cf6');
      setProfileTheme(user.profile_theme || 'default');
      setThemePrimary(user.theme_primary || '#1e1b4b');
      setThemeSecondary(user.theme_secondary || '#0f172a');
      setEmail(user.email || '');
      setPomoWork(user.preferences?.pomoWork ?? 25);
      setPomoBreak(user.preferences?.pomoBreak ?? 5);
      setSoundEnabled(user.preferences?.soundEnabled ?? true);
      setShowBioPrivacy(user.privacy_settings?.showBio || 'everyone');
      setAllowDMs(user.privacy_settings?.allowDMs || 'everyone');
      setAllowFriendRequests(user.privacy_settings?.allowFriendRequests || 'everyone');
      setCurrentPassword('');
      setNewPassword('');
      setUpgradeEmail('');
      setUpgradePassword('');
      setShowDeleteConfirm(false);
      setDeletePassword('');
      setDeleteConfirmText('');
    } else {
      stopMediaTests();
    }
  }, [isOpen, user?.id]);

  // Enumerate devices when Voice & Video tab is opened
  useEffect(() => {
    if (isOpen && section === 'voice') {
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((list) => {
          setDevices({
            mics: list.filter((d) => d.kind === 'audioinput'),
            cams: list.filter((d) => d.kind === 'videoinput'),
            speakers: list.filter((d) => d.kind === 'audiooutput')
          });
        })
        .catch(() => {});
    } else {
      stopMediaTests();
    }
  }, [isOpen, section]);

  const stopMediaTests = () => {
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testAudioRef.current) {
      testAudioRef.current.srcObject = null;
    }
    setTestingAudio(false);
    setTestingVideo(false);
    setMicLevel(0);
  };

  useEffect(() => {
    return () => stopMediaTests();
  }, []);

  if (!isOpen || !user) return null;

  const toggleMicTest = async () => {
    if (testingAudio) {
      stopMediaTests();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression,
          echoCancellation,
          autoGainControl: autoGain,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {})
        }
      });
      testStreamRef.current = stream;
      setTestingAudio(true);

      if (testAudioRef.current) {
        testAudioRef.current.srcObject = stream;
        testAudioRef.current.play().catch(() => {});
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        src.connect(analyser);
        const arr = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          if (!testStreamRef.current) {
            ctx.close().catch(() => {});
            return;
          }
          analyser.getByteFrequencyData(arr);
          let sum = 0;
          for (let i = 0; i < arr.length; i++) sum += arr[i];
          setMicLevel(Math.min(100, Math.round((sum / arr.length) * 2)));
          requestAnimationFrame(loop);
        };
        loop();
      }
    } catch {
      addToast('Could not access microphone', 'error');
    }
  };

  const toggleVideoTest = async () => {
    if (testingVideo) {
      stopMediaTests();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : true
      });
      testStreamRef.current = stream;
      setTestingVideo(true);
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
      }
    } catch {
      addToast('Could not access camera', 'error');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarImage(file);
      setAvatarUrl(compressed);
      addToast('Photo ready — save to apply', 'info');
    } catch (err) {
      addToast(err.message || 'Could not process image', 'error');
    }
    e.target.value = '';
  };

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressBannerImage(file);
      setBannerUrl(compressed);
      addToast('Banner ready — save to apply', 'info');
    } catch (err) {
      addToast(err.message || 'Could not process banner', 'error');
    }
    e.target.value = '';
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        avatar_color: avatarColor,
        avatar_url: avatarUrl,
        status_mode: statusMode,
        status_text: statusText.trim(),
        custom_emoji: customEmoji.trim(),
        preferences: {
          pomoWork: Number(pomoWork) || 25,
          pomoBreak: Number(pomoBreak) || 5,
          soundEnabled,
          chatDensity,
          selfViewMode
        },
        voice_settings: {
          noiseSuppression,
          echoCancellation,
          autoGain,
          inputMode,
          pttKey,
          soundboardVolume
        }
      };

      if (!user.is_guest) {
        payload.username = username.trim();
        payload.pronouns = pronouns.trim();
        payload.bio = bio.trim();
        payload.banner_color = bannerColor;
        payload.banner_url = bannerUrl;
        payload.accent_color = accentColor;
        payload.profile_theme = profileTheme;
        payload.theme_primary = themePrimary;
        payload.theme_secondary = themeSecondary;
        payload.avatar_frame = avatarFrame;
        payload.privacy_settings = {
          showBio: showBioPrivacy,
          allowDMs,
          allowFriendRequests
        };
      }

      await updateProfile(payload);
      if (!user.is_guest) {
        localStorage.setItem('studyhub_pomo_work', String(Number(pomoWork) || 25));
        localStorage.setItem('studyhub_pomo_break', String(Number(pomoBreak) || 5));
      }
      addToast('Settings saved!', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    const emailChanged = email.trim() && email.trim().toLowerCase() !== (user.email || '').toLowerCase();
    if (newPassword && !currentPassword) {
      addToast('Please enter your current password to set a new password.', 'error');
      return;
    }
    if (!emailChanged && !newPassword) {
      addToast('No account changes to save.', 'info');
      return;
    }

    setSaving(true);
    try {
      if (emailChanged) {
        await updateProfile({ email: email.trim() });
        addToast('Email updated!', 'success');
      }
      if (newPassword) {
        await changePassword(currentPassword, newPassword);
        setCurrentPassword('');
        setNewPassword('');
        addToast('Password updated & older sessions revoked!', 'success');
      }
    } catch (err) {
      addToast(err.message || 'Account update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    setSaving(true);
    try {
      await logoutAllOtherSessions();
      addToast('Signed out from all other devices.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to revoke other sessions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportMyData = async () => {
    if (!token || exportingData) return;
    setExportingData(true);
    try {
      const res = await fetch('/api/auth/export', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to export data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studyhub-account-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Personal data archive downloaded!', 'success');
    } catch (err) {
      addToast(err.message || 'Data export failed', 'error');
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteOwnAccount = async (e) => {
    e?.preventDefault();
    if (!user.is_guest) {
      if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
        addToast('Type DELETE to confirm permanent account removal.', 'error');
        return;
      }
      if (!deletePassword) {
        addToast('Please enter your password to confirm deletion.', 'error');
        return;
      }
    }

    setDeletingAccount(true);
    try {
      stopMediaTests();
      await deleteAccount(user.is_guest ? '' : deletePassword);
      addToast('Account permanently deleted.', 'info');
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to delete account', 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleUpgradeGuest = async (e) => {
    e.preventDefault();
    if (!upgradeEmail || !upgradePassword) return;
    setSaving(true);
    try {
      await upgradeGuest(upgradeEmail, upgradePassword, name.trim() || user.name);
      addToast('Account upgraded! Full profile & workspace customization unlocked.', 'success');
      setSection('profile');
    } catch (err) {
      addToast(err.message || 'Upgrade failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    stopMediaTests();
    logout();
    addToast('Signed out', 'info');
    onClose();
  };

  const navItems = [
    { id: 'profile', label: 'Profile', icon: User },
    ...(user.is_guest ? [{ id: 'upgrade', label: 'Unlock Account', icon: Sparkles }] : [{ id: 'account', label: 'My Account', icon: Shield }]),
    { id: 'voice', label: 'Voice & Video', icon: Mic },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
    ...(!user.is_guest ? [{ id: 'privacy', label: 'Privacy & Safety', icon: Lock }] : [])
  ];

  const previewThemeStyle = getProfileThemeStyle({
    profile_theme: profileTheme,
    theme_primary: themePrimary,
    theme_secondary: themeSecondary,
    accent_color: accentColor
  });
  const activeStatusMeta = getActivityMeta(statusMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <div className="glass-panel modal-panel-enter w-full max-w-4xl h-[92dvh] sm:h-[86dvh] max-h-[720px] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Left Navigation Sidebar (Discord-style Settings) */}
        <div className="w-full md:w-56 bg-dark-950/70 border-b md:border-b-0 md:border-r border-white/10 p-2.5 sm:p-3 md:p-4 flex md:flex-col gap-1 overflow-x-auto no-scrollbar md:overflow-y-auto flex-shrink-0">
          <div className="hidden md:block text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 pb-2">
            User Settings
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-brand-purple/20 text-white border border-brand-purple/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-brand-purple' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}

          <div className="hidden md:block flex-1" />

          <button
            onClick={handleLogout}
            className="btn-tactile touch-control flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-white capitalize">
              {navItems.find((n) => n.id === section)?.label || 'Settings'}
            </h3>
            <button
              onClick={() => {
                stopMediaTests();
                onClose();
              }}
              className="touch-control btn-tactile p-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div key={section} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 animate-fade-in">
            {/* SECTION: PROFILE */}
            {section === 'profile' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Form */}
                <form onSubmit={handleSaveSettings} className="lg:col-span-7 space-y-4">
                  {/* Profile Pic */}
                  <div className="flex items-center gap-4 p-3 rounded-2xl bg-dark-900/60 border border-white/5">
                    <UserAvatar
                      name={name || user.name}
                      avatarUrl={avatarUrl}
                      avatarColor={avatarColor}
                      avatarFrame={user.is_guest ? 'none' : avatarFrame}
                      sizeClass="w-16 h-16 text-lg"
                      statusMode={statusMode}
                    />
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-200 mb-1.5">Avatar Photo</div>
                      <div className="flex flex-wrap gap-2">
                        <label className="px-3 py-1.5 rounded-xl bg-brand-purple/20 hover:bg-brand-purple/30 text-brand-purple text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5" />
                          {avatarUrl ? 'Change' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        </label>
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => setAvatarUrl(null)}
                            className="px-2.5 py-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discord Activity Mode (Available to all users, including guests) */}
                  <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/5 space-y-2">
                    <div className="text-xs font-semibold text-slate-200">Activity Mode</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {STATUS_ORDER.map((modeId) => {
                        const st = ACTIVITY_STATUSES[modeId];
                        const selected = normalizeActivityMode(statusMode) === modeId;
                        return (
                          <button
                            key={modeId}
                            type="button"
                            onClick={() => setStatusMode(modeId)}
                            className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                              selected
                                ? 'bg-brand-purple/20 border-brand-purple text-white'
                                : 'bg-dark-950/60 border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dotClass}`} />
                            <span className="text-[11px] font-semibold truncate">{st.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Display Name + Pronouns + Username */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                        maxLength={30}
                        required
                      />
                    </div>
                    {!user.is_guest && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Pronouns
                        </label>
                        <input
                          type="text"
                          value={pronouns}
                          onChange={(e) => setPronouns(e.target.value)}
                          placeholder="e.g. they/them"
                          className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                          maxLength={24}
                        />
                      </div>
                    )}
                  </div>

                  {!user.is_guest && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Username Handle
                        </label>
                        <div className="relative">
                          <AtSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full glass-input pl-8 pr-3 py-2 rounded-xl text-sm"
                            maxLength={24}
                          />
                        </div>
                      </div>

                      {/* Banner Customization */}
                      <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">Profile Banner</span>
                          <div className="flex gap-2">
                            <label className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer">
                              Upload Banner
                              <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                            </label>
                            {bannerUrl && (
                              <button
                                type="button"
                                onClick={() => setBannerUrl(null)}
                                className="px-2 py-1 rounded-lg text-rose-400 hover:bg-rose-500/10 text-xs"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-slate-400">Preset or custom hex</span>
                          <span className="font-mono text-[10px] text-slate-400 uppercase">{bannerColor}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
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
                                bannerColor.toLowerCase() === c.toLowerCase() && !bannerUrl ? 'border-white scale-110 shadow-md' : 'border-white/15 opacity-75'
                              }`}
                            />
                          ))}
                          <label
                            title="Pick custom banner color"
                            className="relative w-7 h-7 rounded-lg border-2 border-dashed border-white/40 hover:border-white flex items-center justify-center cursor-pointer transition-colors overflow-hidden group shadow-sm"
                            style={{ backgroundColor: bannerColor }}
                          >
                            <Pipette className="w-3.5 h-3.5 text-white drop-shadow group-hover:scale-110 transition-transform" />
                            <input
                              type="color"
                              value={bannerColor.startsWith('#') ? bannerColor : '#1e1b4b'}
                              onChange={(e) => {
                                setBannerColor(e.target.value);
                                setBannerUrl(null);
                              }}
                              className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                            />
                          </label>
                          <input
                            type="text"
                            value={bannerColor}
                            onChange={(e) => {
                              setBannerColor(e.target.value);
                              setBannerUrl(null);
                            }}
                            placeholder="#hex"
                            className="w-20 glass-input px-2 py-1 rounded-lg text-xs font-mono uppercase text-center"
                            maxLength={7}
                          />
                        </div>
                      </div>

                      {/* Discord-style Dual-Color Profile Card Theme */}
                      <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">Profile Card Theme</span>
                          <span className="text-[10px] text-slate-400">Dual gradient reflected on your card</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PROFILE_THEMES.map((t) => {
                            const active = profileTheme === t.id;
                            return (
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
                                className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                                  active
                                    ? 'border-white bg-white/10 text-white'
                                    : 'border-white/10 bg-dark-950/60 text-slate-400 hover:text-white'
                                }`}
                              >
                                <span
                                  className="w-4 h-4 rounded-md flex-shrink-0 border border-white/20"
                                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}
                                />
                                <span className="text-[11px] font-semibold truncate">{t.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-dark-950/70 border border-white/10 text-[11px] text-slate-300 cursor-pointer">
                            <span>Primary</span>
                            <input
                              type="color"
                              value={themePrimary}
                              onChange={(e) => {
                                setThemePrimary(e.target.value);
                                setProfileTheme('custom');
                              }}
                              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                            />
                          </label>
                          <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-dark-950/70 border border-white/10 text-[11px] text-slate-300 cursor-pointer">
                            <span>Secondary</span>
                            <input
                              type="color"
                              value={themeSecondary}
                              onChange={(e) => {
                                setThemeSecondary(e.target.value);
                                setProfileTheme('custom');
                              }}
                              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                            />
                          </label>
                          <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-dark-950/70 border border-white/10 text-[11px] text-slate-300 cursor-pointer">
                            <span>Accent</span>
                            <input
                              type="color"
                              value={accentColor}
                              onChange={(e) => setAccentColor(e.target.value)}
                              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Avatar Decoration Frame */}
                      <div className="p-3 rounded-2xl bg-dark-900/50 border border-white/5 space-y-2">
                        <span className="text-xs font-semibold text-slate-200 block">Avatar Frame Decoration</span>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {AVATAR_FRAMES.map((frame) => (
                            <button
                              key={frame.id}
                              type="button"
                              onClick={() => setAvatarFrame(frame.id)}
                              className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                                avatarFrame === frame.id
                                  ? 'border-brand-purple bg-brand-purple/20 text-white'
                                  : 'border-white/10 bg-dark-950/60 text-slate-400 hover:text-white'
                              }`}
                            >
                              <UserAvatar
                                name={name || user.name}
                                avatarUrl={avatarUrl}
                                avatarColor={avatarColor}
                                avatarFrame={frame.id}
                                sizeClass="w-7 h-7 text-[10px]"
                              />
                              <span className="text-[10px] font-medium truncate w-full text-center">{frame.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Status */}
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Emoji</label>
                          <input
                            type="text"
                            value={customEmoji}
                            onChange={(e) => setCustomEmoji(e.target.value)}
                            placeholder="📚"
                            maxLength={4}
                            className="w-full glass-input px-2.5 py-2 rounded-xl text-sm text-center"
                          />
                        </div>
                        <div className="col-span-9">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custom Status Note</label>
                          <input
                            type="text"
                            value={statusText}
                            onChange={(e) => setStatusText(e.target.value)}
                            placeholder="Prepping algorithms..."
                            maxLength={60}
                            className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                          />
                        </div>
                      </div>

                      {/* Bio */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          About Me / Bio
                        </label>
                        <textarea
                          rows={3}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Share your study goals, courses, or favorite music..."
                          className="w-full glass-input px-3 py-2 rounded-xl text-sm resize-none"
                          maxLength={200}
                        />
                      </div>
                    </>
                  )}

                  {/* Avatar Color with Custom Color Picker */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Avatar Color
                      </label>
                      <span className="font-mono text-[10px] text-slate-400 uppercase">{avatarColor}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAvatarColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-7 h-7 rounded-full transition-transform ${
                            avatarColor.toLowerCase() === c.toLowerCase() ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                      {/* Native Custom Color Picker */}
                      <label
                        title="Pick custom avatar color"
                        className="relative w-7 h-7 rounded-full border-2 border-dashed border-white/40 hover:border-white flex items-center justify-center cursor-pointer transition-colors overflow-hidden group shadow-sm"
                        style={{ backgroundColor: avatarColor }}
                      >
                        <Pipette className="w-3.5 h-3.5 text-white drop-shadow group-hover:scale-110 transition-transform" />
                        <input
                          type="color"
                          value={avatarColor.startsWith('#') ? avatarColor : '#8b5cf6'}
                          onChange={(e) => setAvatarColor(e.target.value)}
                          className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                        />
                      </label>
                      <input
                        type="text"
                        value={avatarColor}
                        onChange={(e) => setAvatarColor(e.target.value)}
                        placeholder="#hex"
                        className="w-20 glass-input px-2 py-1 rounded-lg text-xs font-mono uppercase text-center"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2.5 px-4 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>

                  {user.is_guest && (
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={handleDeleteOwnAccount}
                      className="w-full py-2 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingAccount ? 'Deleting Guest Session...' : 'Delete Guest Session & Exit'}
                    </button>
                  )}
                </form>

                {/* Right Live Discord Profile Preview Card */}
                <div className="lg:col-span-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Live Card Preview
                  </div>
                  <div
                    className="rounded-2xl overflow-hidden border shadow-xl transition-all"
                    style={{
                      background: previewThemeStyle.background,
                      borderColor: previewThemeStyle.borderColor
                    }}
                  >
                    <div
                      className="h-20 w-full bg-cover bg-center"
                      style={{
                        backgroundColor: bannerColor,
                        backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined
                      }}
                    />
                    <div className="px-4 pb-4">
                      <div className="-mt-8 mb-2 flex items-end justify-between">
                        <div className="inline-block p-1 rounded-full bg-dark-950">
                          <UserAvatar
                            name={name || 'SH'}
                            avatarUrl={avatarUrl}
                            avatarColor={avatarColor}
                            avatarFrame={user.is_guest ? 'none' : avatarFrame}
                            sizeClass="w-14 h-14 text-base"
                            statusMode={statusMode}
                          />
                        </div>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 ${activeStatusMeta.badgeBg}`}>
                          <span className={`w-2 h-2 rounded-full ${activeStatusMeta.dotClass}`} />
                          {activeStatusMeta.shortLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-base">{name || 'Student'}</span>
                        {pronouns && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300">{pronouns}</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {username ? `@${username}` : user.is_guest ? 'Guest Student' : 'Member'}
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
              </div>
            )}

            {/* SECTION: MY ACCOUNT */}
            {section === 'account' && !user.is_guest && (
              <div className="max-w-lg space-y-6">
                <form onSubmit={handleSaveAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Change Password</div>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 characters)"
                      minLength={6}
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="py-2.5 px-5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Updating...' : 'Save Account'}
                  </button>
                </form>

                {/* Session Security & Personal Data Export */}
                <div className="p-4 rounded-2xl bg-dark-900/60 border border-white/10 space-y-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Session Security &amp; Personal Data
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Revoke older sessions across other devices or export a complete JSON copy of your StudyHub data.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleLogoutAllDevices}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5 text-amber-400" />
                      Sign Out Other Devices
                    </button>
                    <button
                      type="button"
                      disabled={exportingData}
                      onClick={handleExportMyData}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      {exportingData ? 'Exporting...' : 'Download My Data (JSON)'}
                    </button>
                  </div>
                </div>

                {/* Danger Zone: Permanent Account Deletion */}
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Danger Zone — Delete Account
                      </div>
                      <p className="text-[11px] text-rose-200/80 mt-0.5 leading-relaxed">
                        Permanently removes your profile, rooms you created, tasks, notes, friendships, and direct messages. This cannot be undone.
                      </p>
                    </div>
                  </div>

                  {user.is_admin ? (
                    <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-xl">
                      The active Platform Super-Admin account cannot be self-deleted here for system safety.
                    </div>
                  ) : !showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 rounded-xl bg-rose-600/25 hover:bg-rose-600/45 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete My Account
                    </button>
                  ) : (
                    <form onSubmit={handleDeleteOwnAccount} className="space-y-2.5 pt-2 border-t border-rose-500/20">
                      <input
                        type="password"
                        required
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full glass-input px-3.5 py-2 rounded-xl text-xs"
                      />
                      <input
                        type="text"
                        required
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder='Type "DELETE" to confirm'
                        className="w-full glass-input px-3.5 py-2 rounded-xl text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE' || !deletePassword}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-40"
                        >
                          {deletingAccount ? 'Deleting Account...' : 'Permanently Delete Account'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteConfirmText('');
                          }}
                          className="px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* SECTION: GUEST UPGRADE */}
            {section === 'upgrade' && user.is_guest && (
              <form onSubmit={handleUpgradeGuest} className="max-w-md space-y-4">
                <div className="p-4 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 text-xs text-slate-300 leading-relaxed">
                  Upgrade your Guest session to a permanent StudyHub account! You keep all tasks, notes, profile photo, and joined rooms while unlocking custom banners, bios, pronouns, status modes, and privacy controls.
                </div>
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={upgradeEmail}
                  onChange={(e) => setUpgradeEmail(e.target.value)}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Create password (min 6 chars)"
                  value={upgradePassword}
                  onChange={(e) => setUpgradePassword(e.target.value)}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue text-white text-sm font-semibold"
                >
                  {saving ? 'Upgrading...' : 'Upgrade Account Now'}
                </button>
              </form>
            )}

            {/* SECTION: VOICE & VIDEO */}
            {section === 'voice' && (
              <div className="space-y-5 max-w-2xl">
                {/* Hardware Pickers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Input Device (Mic)</label>
                    <select
                      value={selectedMicId}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                      className="w-full glass-input px-3 py-2 rounded-xl text-xs bg-dark-900 text-white"
                    >
                      <option value="">Default Microphone</option>
                      {devices.mics.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Output Device (Speaker)</label>
                    <select
                      value={selectedSpeakerId}
                      onChange={(e) => setSelectedSpeakerId(e.target.value)}
                      className="w-full glass-input px-3 py-2 rounded-xl text-xs bg-dark-900 text-white"
                    >
                      <option value="">Default Output</option>
                      {devices.speakers.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Mic Test Loopback */}
                <div className="p-4 rounded-2xl bg-dark-900/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Mic Test (Loopback)</div>
                      <div className="text-xs text-slate-400">Speak into your mic to verify audio quality</div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMicTest}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold ${
                        testingAudio ? 'bg-rose-500 text-white' : 'bg-brand-purple text-white'
                      }`}
                    >
                      {testingAudio ? 'Stop Test' : "Let's Check"}
                    </button>
                  </div>
                  <div className="h-2.5 rounded-full bg-dark-950 overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-purple-500 transition-all duration-75"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <audio ref={testAudioRef} className="hidden" />
                </div>

                {/* Input Mode: Voice Activity vs Push-to-Talk */}
                <div className="p-4 rounded-2xl bg-dark-900/60 border border-white/5 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Input Mode</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setInputMode('vad')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        inputMode === 'vad' ? 'border-brand-purple bg-brand-purple/15 text-white' : 'border-white/10 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold">Voice Activity</div>
                      <div className="text-[11px] opacity-75">Detects speaking automatically</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('ptt')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        inputMode === 'ptt' ? 'border-brand-purple bg-brand-purple/15 text-white' : 'border-white/10 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold">Push to Talk</div>
                      <div className="text-[11px] opacity-75">Hold shortcut key ({pttKey}) to talk</div>
                    </button>
                  </div>

                  {inputMode === 'vad' && (
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Input Sensitivity Threshold</span>
                        <span className="font-mono text-brand-purple">{vadThreshold}</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="40"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  )}
                </div>

                {/* Camera Preview & Video Settings */}
                <div className="p-4 rounded-2xl bg-dark-900/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Camera</label>
                      <select
                        value={selectedCamId}
                        onChange={(e) => setSelectedCamId(e.target.value)}
                        className="w-full glass-input px-3 py-1.5 rounded-xl text-xs bg-dark-900 text-white"
                      >
                        <option value="">Default Camera</option>
                        {devices.cams.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={toggleVideoTest}
                      className={`mt-5 px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                        testingVideo ? 'bg-rose-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      {testingVideo ? 'Stop Video' : 'Test Video'}
                    </button>
                  </div>

                  {testingVideo && (
                    <video
                      ref={testVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full max-h-44 object-cover rounded-xl scale-x-[-1] border border-white/10 ${
                        blurBackground ? 'blur-[2px]' : ''
                      }`}
                    />
                  )}
                </div>

                {/* Audio Processing Toggles & Soundboard Volume */}
                <div className="space-y-2.5">
                  {[
                    ['Noise Suppression', 'Filters keyboard clicks & fan noise', noiseSuppression, setNoiseSuppression],
                    ['Echo Cancellation', 'Prevents speaker audio from looping', echoCancellation, setEchoCancellation],
                    ['Automatic Gain Control', 'Balances quiet & loud mic levels', autoGain, setAutoGain],
                    ['Background Edge Blur', 'Softly blurs room edges around portrait', blurBackground, setBlurBackground],
                    ['Skip Green Room Preview', 'Join rooms directly without pre-call check', skipGreenRoom, setSkipGreenRoom]
                  ].map(([title, desc, val, setter]) => (
                    <label key={title} className="flex items-center justify-between p-3 rounded-xl bg-dark-900/50 border border-white/5 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-white">{title}</div>
                        <div className="text-[11px] text-slate-400">{desc}</div>
                      </div>
                      <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                    </label>
                  ))}

                  <div className="p-3 rounded-xl bg-dark-900/50 border border-white/5">
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-brand-purple" /> Soundboard Volume</span>
                      <span className="font-mono text-brand-purple">{soundboardVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={soundboardVolume}
                      onChange={(e) => setSoundboardVolume(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-semibold"
                >
                  Save Voice &amp; Video Preferences
                </button>
              </div>
            )}

            {/* SECTION: APPEARANCE */}
            {section === 'appearance' && (
              <div className="space-y-5 max-w-xl">
                {!user.is_guest && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Accent Color</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ACCENT_THEMES.map((t) => (
                        <button
                          key={t.color}
                          type="button"
                          onClick={() => setAccentColor(t.color)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium ${
                            accentColor === t.color ? 'border-white bg-white/10 text-white' : 'border-white/10 text-slate-300'
                          }`}
                        >
                          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Chat Message Density</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['cozy', 'compact'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setChatDensity(d)}
                        className={`p-3 rounded-xl border text-left capitalize ${
                          chatDensity === d ? 'border-brand-purple bg-brand-purple/15 text-white' : 'border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="text-xs font-bold">{d}</div>
                        <div className="text-[11px] opacity-75">
                          {d === 'cozy' ? 'Avatars + spacious message bubbles' : 'Tight, high-density messages'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Camera Self-View Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['grid', 'In Grid'],
                      ['floating', 'Floating PiP'],
                      ['hidden', 'Hidden']
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSelfViewMode(val)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold ${
                          selfViewMode === val ? 'border-brand-purple bg-brand-purple/15 text-white' : 'border-white/10 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {onOpenBgSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBgSettings();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl glass-card border border-white/10 hover:border-brand-purple/40 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4 text-brand-purple" />
                    Customize 3D Aurora / Wallpaper Background
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-semibold"
                >
                  Save Appearance
                </button>
              </div>
            )}

            {/* SECTION: NOTIFICATIONS */}
            {section === 'notifications' && (
              <div className="space-y-4 max-w-lg">
                <label className="flex items-center justify-between p-3.5 rounded-xl bg-dark-900/50 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Sound Effects &amp; Pings</div>
                    <div className="text-xs text-slate-400">Play audio chimes for notifications, alarms &amp; focus sessions</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="w-4 h-4 accent-purple-500"
                  />
                </label>

                <div className="p-3.5 rounded-xl bg-dark-900/50 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Desktop Browser Notifications</div>
                    <div className="text-xs text-slate-400">Alert when friends invite you or alarms go off</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if ('Notification' in window) {
                        Notification.requestPermission().then((perm) => {
                          addToast(`Browser notifications: ${perm}`, 'info');
                        });
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                  >
                    Enable
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Default Focus (min)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={pomoWork}
                      onChange={(e) => setPomoWork(e.target.value)}
                      className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Default Break (min)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={pomoBreak}
                      onChange={(e) => setPomoBreak(e.target.value)}
                      className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 rounded-xl bg-brand-purple text-white text-sm font-semibold"
                >
                  Save Notification Settings
                </button>
              </div>
            )}

            {/* SECTION: KEYBINDS */}
            {section === 'keybinds' && (
              <div className="space-y-3 max-w-lg">
                <p className="text-xs text-slate-400 mb-3">
                  Global shortcuts available inside any active study room:
                </p>
                {[
                  ['Toggle Microphone Mute', 'Ctrl + Shift + M'],
                  ['Toggle Deafen', 'Ctrl + Shift + D'],
                  ['Toggle Hand Raise', 'Ctrl + Shift + H'],
                  ['Push-to-Talk Key (in PTT mode)', pttKey]
                ].map(([label, shortcut]) => (
                  <div key={label} className="p-3.5 rounded-xl bg-dark-900/50 border border-white/5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{label}</span>
                    <kbd className="px-2.5 py-1 rounded-lg bg-dark-950 border border-white/15 text-[11px] font-mono text-brand-purple">
                      {shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION: PRIVACY & SAFETY */}
            {section === 'privacy' && !user.is_guest && (
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Who can see my Bio &amp; Custom Status</label>
                  <select
                    value={showBioPrivacy}
                    onChange={(e) => setShowBioPrivacy(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Who can send Direct Messages</label>
                  <select
                    value={allowDMs}
                    onChange={(e) => setAllowDMs(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Friend Requests</label>
                  <select
                    value={allowFriendRequests}
                    onChange={(e) => setAllowFriendRequests(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="none">No one (Disable incoming requests)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 rounded-xl bg-brand-purple text-white text-sm font-semibold"
                >
                  Save Privacy Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
