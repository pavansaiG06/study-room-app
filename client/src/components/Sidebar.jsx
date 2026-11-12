import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Heart,
  Users,
  MessageSquare,
  Timer,
  FileText,
  CheckSquare,
  Bell,
  Box,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Check,
  ShieldAlert,
  Shield,
  Flag,
  Activity,
  LogOut,
  Music2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { useNotifications } from '../context/NotificationContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { YouTubeListeningModal } from './YouTubeListeningModal';
import { ACTIVITY_STATUSES, STATUS_ORDER, getActivityMeta } from '../utils/themes';

export function Sidebar({ currentView, onViewChange, onOpenAuthModal, onOpenProfileModal, isHidden, onToggleHide }) {
  const { user, token, updateUser, logout } = useAuth();
  const { myListening } = useSocket();
  const { micMuted, setMicMuted, deafened, setDeafened } = useMediaSettings();
  const { notifications } = useNotifications();
  const { addToast } = useToast();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [hoverRailOpen, setHoverRailOpen] = useState(false);
  const [listeningModalOpen, setListeningModalOpen] = useState(false);
  const statusMenuRef = useRef(null);

  useEffect(() => {
    if (!isHidden) {
      setHoverRailOpen(false);
    }
  }, [isHidden]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleClickOutside = (e) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusMenuOpen]);

  const handleQuickStatusChange = async (modeId) => {
    if (!token || !user) return;
    setStatusMenuOpen(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status_mode: modeId })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        updateUser(data.user);
        const meta = getActivityMeta(modeId);
        addToast(
          modeId === 'invisible'
            ? 'Status set to Invisible — you appear offline to others'
            : `Activity status set to ${meta.label}`,
          'info',
          2200
        );
      }
    } catch {
      addToast('Failed to update status', 'error');
    }
  };

  const currentStatusMeta = getActivityMeta(user?.status_mode);

  const dmUnread = notifications.filter(
    (n) => !n.is_read && n.type === 'dm'
  ).length;

  const friendUnread = notifications.filter(
    (n) => !n.is_read && ['friend_request', 'friend_accepted'].includes(n.type)
  ).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { type: 'section', label: 'CHILL' },
    { id: 'favourites', label: 'Favourite Rooms', icon: Heart },
    { id: 'dms', label: 'Direct Messages', icon: MessageSquare, badge: dmUnread },
    { id: 'friends', label: 'Friends', icon: Users, badge: friendUnread },
    { type: 'section', label: 'STUDY' },
    { id: 'pomodoro', label: 'Pomodoro', icon: Timer },
    { id: 'notes', label: 'Notes', icon: FileText },
    { type: 'section', label: 'WORK' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'alarms', label: 'Alarms', icon: Bell },
    { type: 'section', label: 'SAFETY' },
    { id: 'safety', label: 'Safety & Reports', icon: ShieldAlert },
    ...(user?.is_admin
      ? [
          { type: 'section', label: 'ADMINISTRATION' },
          { id: 'admin-overview', label: 'Admin Console', icon: Shield },
          { id: 'admin-users', label: 'User Moderation', icon: Users },
          { id: 'admin-reports', label: 'Global Reports', icon: Flag },
          { id: 'admin-audit', label: 'Audit & Broadcast', icon: Activity }
        ]
      : [])
  ];

  const iconOnlyItems = navItems.filter((i) => !i.type);

  return (
    <>
      {/* Collapsed Left-Edge Auto-Hover Icon Rail (Desktop pointer only so touch swipes don't snag) */}
      {isHidden && (
        <div
          onMouseEnter={() => setHoverRailOpen(true)}
          onMouseLeave={() => setHoverRailOpen(false)}
          className={`hidden md:flex fixed top-0 left-0 h-[100dvh] z-50 transition-all duration-200 items-center ${
            hoverRailOpen ? 'w-[68px]' : 'w-3.5'
          }`}
        >
          {!hoverRailOpen ? (
            <div
              title="Hover left edge for navigation icons"
              className="w-1.5 h-20 ml-0.5 rounded-full bg-white/15 hover:bg-brand-purple/70 transition-colors shadow-md"
            />
          ) : (
            <div className="h-[calc(100dvh-1rem)] my-2 ml-1.5 w-[60px] rounded-2xl bg-dark-900/95 border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col items-center justify-between py-2.5 px-1.5 animate-popover-in">
              {/* Top: Expand Full Sidebar Button */}
              <div className="flex flex-col items-center gap-2 w-full pb-2 border-b border-white/10">
                <button
                  onClick={() => {
                    setHoverRailOpen(false);
                    onToggleHide();
                  }}
                  title="Expand Full Sidebar"
                  className="w-10 h-10 rounded-xl bg-brand-purple/20 hover:bg-brand-purple text-brand-purple hover:text-white flex items-center justify-center transition-all border border-brand-purple/30 shadow-md"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Icons Only */}
              <div className="flex-1 flex flex-col items-center gap-1.5 py-2 overflow-y-auto w-full">
                {iconOnlyItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setHoverRailOpen(false);
                        onViewChange(item.id);
                      }}
                      title={item.label}
                      className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                        isActive
                          ? 'bg-brand-purple/25 text-brand-purple border border-brand-purple/40'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.badge > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                      <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-dark-950/95 border border-white/15 text-white text-[11px] font-semibold whitespace-nowrap shadow-xl z-50">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bottom: Compact User Avatar / Settings */}
              <div className="pt-2 border-t border-white/10 flex flex-col items-center">
                {user ? (
                  <button
                    onClick={() => {
                      setHoverRailOpen(false);
                      onOpenProfileModal();
                    }}
                    title={`${user.name} — User Settings`}
                    className="p-0.5 rounded-full hover:ring-2 hover:ring-brand-purple transition-all"
                  >
                    <UserAvatar
                      name={user.name}
                      avatarUrl={user.avatar_url}
                      avatarColor={user.avatar_color}
                      avatarFrame={user.avatar_frame}
                      sizeClass="w-8 h-8 text-xs"
                      statusMode={user.status_mode || 'online'}
                    />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setHoverRailOpen(false);
                      onOpenAuthModal();
                    }}
                    title="Sign In / Guest"
                    className="w-9 h-9 rounded-xl bg-brand-purple text-white flex items-center justify-center"
                  >
                    <LogIn className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile backdrop when drawer is open */}
      {!isHidden && (
        <div
          onClick={onToggleHide}
          className="fixed inset-0 bg-black/55 backdrop-blur-xs z-30 md:hidden modal-backdrop-enter"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-[100dvh] z-40 flex-shrink-0 bg-dark-850/95 md:bg-dark-850/90 border-white/5 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden ${
          isHidden
            ? 'w-0 -translate-x-full md:translate-x-0 border-r-0 pointer-events-none'
            : 'w-64 translate-x-0 border-r shadow-2xl md:shadow-none'
        }`}
      >
        <div className="w-64 h-full flex flex-col">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-5 py-5">
            <div
              onClick={() => onViewChange('dashboard')}
              className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-purple to-brand-blue flex items-center justify-center shadow-lg shadow-brand-purple/20">
                <Box className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white tracking-tight leading-none">StudyHub</h1>
                <span className="text-[10px] text-brand-purple font-semibold uppercase tracking-wider">Workspace 3D</span>
              </div>
            </div>
            <button
              onClick={onToggleHide}
              title="Hide Sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation List */}
          <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
            {navItems.map((item, index) => {
              if (item.type === 'section') {
                return (
                  <div key={index} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 pt-4 pb-1">
                    {item.label}
                  </div>
                );
              }

              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`btn-tactile w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-purple/25 to-brand-purple/5 text-white border-l-4 border-brand-purple shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand-purple' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Discord-Style Persistent Bottom User Dock */}
          <div ref={statusMenuRef} className="relative p-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] border-t border-white/5 bg-dark-950/50">
            {statusMenuOpen && user && (
              <div className="animate-popover-in absolute bottom-full left-2.5 right-2.5 mb-2 p-2 rounded-2xl bg-dark-900/95 border border-white/15 shadow-2xl backdrop-blur-xl z-50">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Set Activity Mode
                </div>
                <div className="space-y-1">
                  {STATUS_ORDER.map((modeId) => {
                    const st = ACTIVITY_STATUSES[modeId];
                    const active = currentStatusMeta.id === modeId;
                    return (
                      <button
                        key={modeId}
                        onClick={() => handleQuickStatusChange(modeId)}
                        className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                          active ? 'bg-brand-purple/20 border border-brand-purple/30' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${st.dotClass}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{st.label}</span>
                            {active && <Check className="w-3.5 h-3.5 text-brand-purple" />}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-snug">{st.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!user.is_guest && (
                  <button
                    onClick={() => {
                      setStatusMenuOpen(false);
                      setListeningModalOpen(true);
                    }}
                    className="w-full mt-1.5 pt-1.5 border-t border-white/10 text-[11px] font-medium text-emerald-300 hover:text-white px-2.5 py-1 text-left flex items-center gap-1.5"
                  >
                    <Music2 className="w-3 h-3" />
                    {myListening ? `YouTube: ${myListening.trackTitle || myListening.title}` : 'Share YouTube Track...'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setStatusMenuOpen(false);
                    if (typeof window !== 'undefined' && window.innerWidth < 768) onToggleHide();
                    onOpenProfileModal();
                  }}
                  className="w-full mt-1 pt-1 border-t border-white/10 text-[11px] font-medium text-purple-300 hover:text-white px-2.5 py-1 text-left"
                >
                  Customize profile, banner &amp; theme →
                </button>
                <button
                  onClick={() => {
                    setStatusMenuOpen(false);
                    logout();
                  }}
                  className="w-full mt-1 pt-1 border-t border-white/10 text-[11px] font-medium text-rose-400 hover:text-rose-300 px-2.5 py-1 text-left flex items-center gap-1.5"
                >
                  <LogOut className="w-3 h-3" /> Sign Out
                </button>
              </div>
            )}

            {user ? (
              <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl hover:bg-white/5 transition-colors">
                <div
                  onClick={() => setStatusMenuOpen((p) => !p)}
                  title="Click to switch status (Online / Away / Busy / Invisible)"
                  className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                >
                  <UserAvatar
                    name={user.name}
                    avatarUrl={user.avatar_url}
                    avatarColor={user.avatar_color}
                    avatarFrame={user.avatar_frame}
                    sizeClass="w-8 h-8 text-xs"
                    statusMode={user.status_mode || 'online'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100 truncate">{user.name}</span>
                      {user.is_admin && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold uppercase flex-shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                      <span>
                        {myListening
                          ? `🎵 ${myListening.trackTitle || myListening.title}`
                          : user.custom_emoji
                          ? `${user.custom_emoji} ${user.status_text || currentStatusMeta.shortLabel}`
                          : user.status_text || (user.is_guest ? `${currentStatusMeta.shortLabel} • Guest` : currentStatusMeta.shortLabel)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Audio & Settings Gear buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => setMicMuted((p) => !p)}
                    title={micMuted ? 'Unmute Mic' : 'Mute Mic'}
                    aria-label={micMuted ? 'Unmute Mic' : 'Mute Mic'}
                    className={`btn-tactile p-2 sm:p-1.5 rounded-lg ${
                      micMuted || deafened ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {micMuted || deafened ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => {
                      const next = !deafened;
                      setDeafened(next);
                      if (next) setMicMuted(true);
                    }}
                    title={deafened ? 'Undeafen' : 'Deafen'}
                    aria-label={deafened ? 'Undeafen' : 'Deafen'}
                    className={`btn-tactile p-2 sm:p-1.5 rounded-lg ${
                      deafened ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {deafened ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 768) onToggleHide();
                      onOpenProfileModal();
                    }}
                    title="User Settings"
                    aria-label="User Settings"
                    className="btn-tactile p-2 sm:p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-semibold transition-all shadow-lg shadow-brand-purple/20"
              >
                <LogIn className="w-4 h-4" />
                Sign In / Guest
              </button>
            )}
          </div>
        </div>
      </aside>
      <YouTubeListeningModal isOpen={listeningModalOpen} onClose={() => setListeningModalOpen(false)} />
    </>
  );
}
