import React, { useState } from 'react';
import { X, Sparkles, Mail, Lock, User, ArrowRight, Camera, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { AppealModal } from './AppealModal';
import { compressAvatarImage } from '../utils/image';

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];

export function AuthModal({ isOpen, onClose, initialMode = 'login', upgradeMode = false, onUpgraded }) {
  const { user, login, register, guestLogin, upgradeGuest } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState(initialMode); // 'guest' | 'login' | 'register'
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAppealModal, setShowAppealModal] = useState(false);

  if (!isOpen) return null;

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
      if (upgradeMode && user?.is_guest) {
        if (!email || !password) throw new Error('Email and password are required to upgrade');
        await upgradeGuest(email.trim(), password, name.trim() || user.name);
        addToast('Account upgraded! Chat, camera, screen share & full customization unlocked.', 'success');
        onUpgraded?.();
        onClose();
      } else if (mode === 'guest') {
        const guestName = name.trim() || `Student_${Math.floor(1000 + Math.random() * 9000)}`;
        await guestLogin(guestName, avatarColor, avatarUrl);
        addToast(`Welcome, ${guestName}!`, 'success');
        onClose();
      } else if (mode === 'login') {
        if (!email || !password) throw new Error('Please fill in all fields');
        await login(email, password);
        addToast('Signed in successfully!', 'success');
        onClose();
      } else if (mode === 'register') {
        if (!name || !email || !password) throw new Error('Please fill in all fields');
        await register(email, password, name, avatarColor, avatarUrl);
        addToast('Account created successfully!', 'success');
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md modal-backdrop-enter">
      <div className="glass-panel modal-panel-enter w-full max-w-md p-5 sm:p-8 rounded-2xl shadow-2xl relative border border-white/10 max-h-[92dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tabs */}
        {upgradeMode ? (
          <div className="mb-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase mb-2">
              <Sparkles className="w-3 h-3" /> Unlock Full Account
            </div>
            <h3 className="text-lg font-bold text-white">Upgrade Your Guest Pass</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Keep your current sessions while unlocking Room Chat, Camera, Screen Sharing, Room Creation, Invite Links &amp; DMs.
            </p>
          </div>
        ) : (
        <div className="flex border-b border-white/10 mb-6 gap-2">
          <button
            onClick={() => { setMode('guest'); setError(''); }}
            className={`pb-3 px-3 text-sm font-semibold transition-all flex items-center gap-1.5 ${
              mode === 'guest'
                ? 'text-brand-purple border-b-2 border-brand-purple'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Quick Guest
          </button>
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`pb-3 px-3 text-sm font-semibold transition-all ${
              mode === 'login'
                ? 'text-brand-purple border-b-2 border-brand-purple'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`pb-3 px-3 text-sm font-semibold transition-all ${
              mode === 'register'
                ? 'text-brand-purple border-b-2 border-brand-purple'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex flex-col gap-2">
            <span>{error}</span>
            {error.toLowerCase().includes('banned') && (
              <button
                type="button"
                onClick={() => setShowAppealModal(true)}
                className="self-start px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold"
              >
                Appeal Ban / Message Admin
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(upgradeMode || mode === 'guest' || mode === 'register') && (
            <>
              {/* Profile Picture Uploader (available for both Guest & New Account) */}
              <div className="flex items-center gap-4 pb-1">
                <div className="relative group">
                  <UserAvatar
                    name={name || 'SH'}
                    avatarUrl={avatarUrl}
                    avatarColor={avatarColor}
                    sizeClass="w-16 h-16 text-lg"
                  />
                  <label
                    title="Upload profile picture"
                    className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                  >
                    <Camera className="w-5 h-5 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-200 cursor-pointer transition-colors inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-brand-purple" />
                      {avatarUrl ? 'Change Photo' : 'Add Profile Pic'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl(null)}
                        className="p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Optional — shown in rooms and chat.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder={mode === 'guest' ? 'e.g. Alex (or leave blank)' : 'Your full name'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                    maxLength={30}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Choose Avatar Color
                </label>
                <div className="flex gap-2">
                  {AVATAR_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        avatarColor === color ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'guest' && (
            <p className="text-xs text-slate-400">
              No password required. You can upload a profile photo, join rooms, or upgrade to a full account later.
            </p>
          )}

          {(upgradeMode || mode === 'login' || mode === 'register') && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                    minLength={6}
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-95 text-white font-semibold text-sm transition-all shadow-lg shadow-brand-purple/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <span>
                  {upgradeMode
                    ? 'Upgrade & Unlock Features'
                    : mode === 'guest'
                    ? 'Join as Guest'
                    : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <AppealModal
        isOpen={showAppealModal}
        onClose={() => setShowAppealModal(false)}
        userEmail={email}
      />
    </div>
  );
}
