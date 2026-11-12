import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  MessageSquare,
  Shield,
  Crown,
  Volume2,
  Ban,
  UserMinus,
  Check,
  Flag,
  Lock,
  Music2,
  Video,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { useToast } from './Toast';
import { UserAvatar } from './UserAvatar';
import { ReportModal } from './ReportModal';
import { getProfileThemeStyle, getActivityMeta } from '../utils/themes';

export function UserPopoutCard({
  targetUserId,
  roomContext = null, // optional: { roomId, myRole, participant, onKick, onBan, onToggleAdmin }
  onClose,
  onOpenDM
}) {
  const { user, token } = useAuth();
  const { getParticipantVolume, setParticipantVolume } = useMediaSettings();
  const { addToast } = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickDmText, setQuickDmText] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!targetUserId) return;
    setLoading(true);
    fetch(`/api/auth/users/${targetUserId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetUserId, token]);

  if (!targetUserId) return null;

  const isMe = user?.id === targetUserId;
  const vol = getParticipantVolume(targetUserId);

  const handleAddFriend = async () => {
    if (!token) {
      addToast('Sign in to add friends', 'info');
      return;
    }
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || 'Friend request sent!', 'success');
        setProfile((p) => (p ? { ...p, friendshipStatus: 'pending' } : p));
      } else {
        addToast(data.error || 'Could not send request', 'error');
      }
    } catch {}
  };

  const handleBlock = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        addToast('User blocked', 'info');
        onClose();
      }
    } catch {}
  };

  const handleQuickDM = async (e) => {
    e.preventDefault();
    if (!quickDmText.trim() || !token) return;
    try {
      const res = await fetch(`/api/messages/${targetUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: quickDmText.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setQuickDmText('');
        addToast(`Message sent to ${profile?.name}`, 'success');
      } else {
        addToast(data.error || 'Failed to send DM', 'error');
      }
    } catch {}
  };

  const themeStyle = profile ? getProfileThemeStyle(profile) : null;
  const activityMeta = profile
    ? getActivityMeta(
        isMe
          ? profile.status_mode
          : profile.presence?.online
          ? profile.presence.statusMode || profile.status_mode
          : 'offline'
      )
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm modal-backdrop-enter" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          themeStyle
            ? { background: themeStyle.background, borderColor: themeStyle.borderColor }
            : undefined
        }
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl glass-panel modal-panel-enter border border-white/15 shadow-2xl relative"
      >
        <button
          onClick={onClose}
          className="touch-control btn-tactile absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/50 text-slate-200 hover:text-white backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>

        {loading || !profile ? (
          <div className="p-10 text-center text-xs text-slate-400">Loading profile...</div>
        ) : (
          <>
            {/* Discord-style Profile Banner */}
            <div
              className="h-24 w-full bg-cover bg-center relative"
              style={{
                backgroundColor: profile.banner_color || '#1e1b4b',
                backgroundImage: profile.banner_url ? `url(${profile.banner_url})` : undefined
              }}
            />

            {/* Avatar overlapping banner */}
            <div className="px-5 pb-5">
              <div className="-mt-10 mb-3 flex items-end justify-between">
                <div className="p-1 rounded-full bg-dark-900">
                  <UserAvatar
                    name={profile.name}
                    avatarUrl={profile.avatar_url}
                    avatarColor={profile.avatar_color}
                    avatarFrame={profile.avatar_frame}
                    sizeClass="w-16 h-16 text-xl"
                    statusMode={activityMeta.id}
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1 ${activityMeta.badgeBg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${activityMeta.dotClass}`} />
                    {activityMeta.shortLabel}
                  </span>
                  {profile.is_admin && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/35 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1">
                      <Shield className="w-3 h-3" /> SUPER ADMIN
                    </span>
                  )}
                  {roomContext?.participant?.role && roomContext.participant.role !== 'member' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1">
                      <Crown className="w-3 h-3" /> {roomContext.participant.role}
                    </span>
                  )}
                </div>
              </div>

              {/* Identity */}
              <div className="mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-white leading-tight">{profile.name}</h3>
                  {profile.pronouns && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-slate-300">
                      {profile.pronouns}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {profile.username ? `@${profile.username}` : profile.is_guest ? 'Guest Student' : 'Member'}
                </div>

                {(profile.custom_emoji || profile.status_text) && (
                  <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-dark-900/60 border border-white/5 text-xs text-slate-200 inline-flex items-center gap-1.5">
                    {profile.custom_emoji && <span>{profile.custom_emoji}</span>}
                    <span>{profile.status_text}</span>
                  </div>
                )}

                {profile.presence?.currentRoomName && (
                  <div className="mt-2 text-[11px] text-emerald-400 font-medium">
                    Studying in &ldquo;{profile.presence.currentRoomName}&rdquo;
                  </div>
                )}

                {profile.presence?.listening && (
                  <div className="mt-3 p-2.5 rounded-2xl bg-dark-950/75 border border-emerald-500/25 flex items-center gap-2.5">
                    {profile.presence.listening.thumbnailUrl && (
                      <img
                        src={profile.presence.listening.thumbnailUrl}
                        alt={profile.presence.listening.title}
                        className="w-11 h-9 rounded-lg object-cover flex-shrink-0 border border-white/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
                        {profile.presence.listening.isSong ? (
                          <span className="text-emerald-300 flex items-center gap-1">
                            <Music2 className="w-2.5 h-2.5" /> Listening on YouTube
                          </span>
                        ) : (
                          <span className="text-sky-300 flex items-center gap-1">
                            <Video className="w-2.5 h-2.5" /> Watching on YouTube
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-white truncate">
                        {profile.presence.listening.isSong
                          ? profile.presence.listening.trackTitle || profile.presence.listening.title
                          : profile.presence.listening.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {profile.presence.listening.artistName || profile.presence.listening.author}
                      </div>
                    </div>
                    {profile.presence.listening.url && (
                      <a
                        href={profile.presence.listening.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 flex-shrink-0"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Study Streak & Focus Stats */}
              {(profile.study_streak > 0 || profile.total_focus_minutes > 0) && (
                <div className="mb-3 flex items-center gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                    🔥 {profile.study_streak || 0}d streak
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                    ⏱️ {profile.total_focus_minutes || 0} min studied
                  </span>
                </div>
              )}

              {/* Bio */}
              {profile.bio && (
                <div className="mb-4 p-3 rounded-xl bg-dark-900/50 border border-white/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">About Me</div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}

              {/* Local User Volume Slider (Discord-style) */}
              {!isMe && roomContext && (
                <div className="mb-4 p-3 rounded-xl bg-dark-900/50 border border-white/5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-brand-purple" /> User Volume
                    </span>
                    <span className="font-mono text-brand-purple font-bold">{vol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={vol}
                    onChange={(e) => setParticipantVolume(targetUserId, e.target.value)}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Actions */}
              {!isMe && (
                (!user || user.is_guest) ? (
                  <div className="p-3 rounded-xl bg-dark-900/70 border border-white/10 text-center space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Lock className="w-3.5 h-3.5" />
                      Guest Mode Restrictions
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Create a free account to message, add friends, or submit reports.
                    </p>
                  </div>
                ) : (
                <div className="space-y-2.5">
                  {/* Quick DM box */}
                  <form onSubmit={handleQuickDM} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={`Message @${profile.name}...`}
                      value={quickDmText}
                      onChange={(e) => setQuickDmText(e.target.value)}
                      className="flex-1 glass-input px-3 py-1.5 rounded-xl text-xs"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-xs font-semibold"
                    >
                      Send
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    {profile.friendshipStatus === 'none' && (
                      <button
                        onClick={handleAddFriend}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add Friend
                      </button>
                    )}
                    {profile.friendshipStatus === 'accepted' && (
                      <span className="flex-1 py-2 px-3 rounded-xl bg-white/5 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Friends
                      </span>
                    )}
                    {profile.friendshipStatus === 'pending' && (
                      <span className="flex-1 py-2 px-3 rounded-xl bg-white/5 text-amber-400 text-xs font-semibold text-center">
                        Pending
                      </span>
                    )}

                    {onOpenDM && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenDM(profile);
                        }}
                        className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                    )}

                    <button
                      onClick={() => setReportOpen(true)}
                      title="Report Restricted Activity"
                      className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={handleBlock}
                      title="Block User"
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Host/Admin Moderation Controls */}
                  {roomContext && (roomContext.myRole === 'owner' || roomContext.myRole === 'admin') && roomContext.participant?.role !== 'owner' && (
                    <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
                      {roomContext.myRole === 'owner' && roomContext.onToggleAdmin && (
                        <button
                          onClick={() => roomContext.onToggleAdmin(targetUserId, roomContext.participant?.role === 'admin' ? 'member' : 'admin')}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1"
                        >
                          <Shield className="w-3 h-3" />
                          {roomContext.participant?.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      )}
                      {roomContext.onKick && (roomContext.myRole === 'owner' || roomContext.participant?.role !== 'admin') && (
                        <button
                          onClick={() => {
                            roomContext.onKick(roomContext.participant?.socketId);
                            onClose();
                          }}
                          className="py-1.5 px-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <UserMinus className="w-3 h-3" /> Kick
                        </button>
                      )}
                      {roomContext.onBan && (roomContext.myRole === 'owner' || roomContext.participant?.role !== 'admin') && (
                        <button
                          onClick={() => {
                            roomContext.onBan(targetUserId);
                            onClose();
                          }}
                          className="py-1.5 px-2.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" /> Ban
                        </button>
                      )}
                    </div>
                  )}
                </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>

    <ReportModal
      isOpen={reportOpen}
      onClose={() => setReportOpen(false)}
      targetUser={profile}
      roomId={roomContext?.roomId || null}
      targetType="user"
    />
    </>
  );
}
