import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Flag,
  Activity,
  Ban,
  AlertTriangle,
  Check,
  X,
  Search,
  Trash2,
  Megaphone,
  Download,
  UserCheck,
  Clock,
  VolumeX,
  Power
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { UserAvatar } from '../components/UserAvatar';

export function AdminConsoleView({ initialTab = 'overview' }) {
  const { user, token } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [overview, setOverview] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');

  // Announcement draft
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annLevel, setAnnLevel] = useState('info');

  // Moderation modals
  const [warnTarget, setWarnTarget] = useState(null);
  const [warnReason, setWarnReason] = useState('');
  const [warnSeverity, setWarnSeverity] = useState('warning');

  const [banTarget, setBanTarget] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadAdminData = async () => {
    if (!token || !user?.is_admin) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [ovRes, usersRes, repRes, roomsRes, logsRes] = await Promise.all([
        fetch('/api/admin/overview', { headers }),
        fetch(`/api/admin/users?q=${encodeURIComponent(userSearch)}&filter=${userFilter}`, { headers }),
        fetch('/api/admin/reports', { headers }),
        fetch('/api/admin/rooms', { headers }),
        fetch('/api/admin/audit-logs', { headers })
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (usersRes.ok) setUsersList((await usersRes.json()).users || []);
      if (repRes.ok) setReportsList((await repRes.json()).reports || []);
      if (roomsRes.ok) setRoomsList((await roomsRes.json()).rooms || []);
      if (logsRes.ok) setAuditLogs((await logsRes.json()).logs || []);
    } catch {
      addToast('Failed to load admin console data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [token, user?.is_admin, userFilter]);

  if (!user?.is_admin) {
    return (
      <div className="glass-panel p-10 rounded-2xl text-center text-rose-400">
        Access Denied — Platform Administrator privileges required.
      </div>
    );
  }

  const handleIssueWarning = async (e) => {
    e.preventDefault();
    if (!warnTarget || !warnReason.trim()) return;
    try {
      const res = await fetch(`/api/admin/users/${warnTarget.id}/warn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: warnReason.trim(), severity: warnSeverity })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to issue warning');
      addToast(`Official warning sent to ${warnTarget.name}`, 'success');
      setWarnTarget(null);
      setWarnReason('');
      loadAdminData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBanUser = async (e) => {
    e.preventDefault();
    if (!banTarget) return;
    try {
      const res = await fetch(`/api/admin/users/${banTarget.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: banReason.trim() || 'Violated platform rules' })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to ban user');
      addToast(`${banTarget.name} permanently banned from StudyHub`, 'info');
      setBanTarget(null);
      setBanReason('');
      loadAdminData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleUnbanUser = async (target) => {
    try {
      const res = await fetch(`/api/admin/users/${target.id}/unban`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addToast(`${target.name} has been unbanned`, 'success');
        loadAdminData();
      }
    } catch {}
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to delete user');
      addToast(`Permanently deleted account for ${deleteTarget.name}`, 'info');
      setDeleteTarget(null);
      loadAdminData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleMuteChat = async (target, minutes) => {
    try {
      const res = await fetch(`/api/admin/users/${target.id}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ minutes })
      });
      if (res.ok) {
        addToast(minutes > 0 ? `Muted ${target.name} for ${minutes}m` : `Restored chat for ${target.name}`, 'info');
        loadAdminData();
      }
    } catch {}
  };

  const handleInspectHistory = async (target) => {
    setHistoryTarget(target);
    setHistoryData(null);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setHistoryData(await res.json());
    } catch {}
  };

  const handlePurgeGuests = async () => {
    try {
      const res = await fetch('/api/admin/users/guests/cleanup?hours=24', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (res.ok) {
        addToast(`Cleaned up ${d.deleted} idle guest accounts`, 'success');
        loadAdminData();
      }
    } catch {}
  };

  const handleReportStatus = async (reportId, status, reviewerNote) => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, reviewer_note: reviewerNote })
      });
      if (res.ok) {
        addToast(`Report marked ${status.replace('_', ' ')}`, 'success');
        loadAdminData();
      }
    } catch {}
  };

  const handleShutdownRoom = async (room, deleteRoom = false) => {
    try {
      const res = await fetch(`/api/admin/rooms/${room.id}/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deleteRoom })
      });
      if (res.ok) {
        addToast(deleteRoom ? `Deleted room "${room.name}"` : `Shut down & locked "${room.name}"`, 'info');
        loadAdminData();
      }
    } catch {}
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return;
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: annTitle.trim(), message: annMessage.trim(), level: annLevel })
      });
      if (res.ok) {
        addToast('Platform announcement broadcasted!', 'success');
        setAnnTitle('');
        setAnnMessage('');
        loadAdminData();
      }
    } catch {}
  };

  const handleClearAnnouncement = async (id) => {
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Announcement cleared', 'info');
        loadAdminData();
      }
    } catch {}
  };

  const exportAuditLogs = () => {
    const blob = new Blob([JSON.stringify(auditLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studyhub-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = overview?.stats || {};

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-dark-900/70 to-rose-500/10 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Platform Super-Admin Console</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase">
                Verified Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitor live activity, manage users, review all safety reports, issue warnings, and enforce permanent bans.
            </p>
          </div>
        </div>

        <button
          onClick={loadAdminData}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
        >
          {loading ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      {/* Console Sub-Navigation */}
      <div className="flex overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pb-1">
        {[
          ['overview', 'Overview & Broadcasts', Shield],
          ['users', `User Management (${usersList.length})`, Users],
          ['reports', `Global Reports (${stats.openReportsCount || 0} open)`, Flag],
          ['rooms', `Rooms Monitor (${roomsList.length})`, Power],
          ['audit', 'Audit Ledger', Activity]
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`btn-tactile touch-control whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 flex-shrink-0 ${
              activeTab === id
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'glass-card border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & BROADCASTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              ['Registered Users', stats.registeredUsers ?? 0, 'text-brand-purple'],
              ['Guest Sessions', stats.guestUsers ?? 0, 'text-slate-300'],
              ['Online Right Now', stats.onlineUsersCount ?? 0, 'text-emerald-400'],
              ['Live Study Rooms', `${stats.activeRoomsCount ?? 0} (${stats.liveParticipantsCount ?? 0} in call)`, 'text-cyan-400'],
              ['Open Reports', stats.openReportsCount ?? 0, 'text-rose-400'],
              ['Banned / Warned', `${stats.bannedUsers ?? 0} / ${stats.warningsCount ?? 0}`, 'text-amber-300']
            ].map(([title, val, cls]) => (
              <div key={title} className="glass-panel p-4 rounded-2xl border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
                <div className={`text-lg font-extrabold mt-1 ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Global System Announcement Broadcaster */}
            <form onSubmit={handleBroadcast} className="lg:col-span-7 glass-panel p-5 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-400" /> Global Announcement Banner
                </h3>
                {overview?.activeAnnouncement && (
                  <button
                    type="button"
                    onClick={() => handleClearAnnouncement(overview.activeAnnouncement.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Clear Active Banner
                  </button>
                )}
              </div>

              {overview?.activeAnnouncement && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-100">
                  <strong className="block text-amber-300">Active: {overview.activeAnnouncement.title}</strong>
                  <span>{overview.activeAnnouncement.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Announcement title"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="sm:col-span-2 glass-input px-3 py-2 rounded-xl text-xs"
                />
                <select
                  value={annLevel}
                  onChange={(e) => setAnnLevel(e.target.value)}
                  className="glass-input px-3 py-2 rounded-xl text-xs bg-dark-900 text-white"
                >
                  <option value="info">Info Notice</option>
                  <option value="warning">Maintenance / Warning</option>
                  <option value="urgent">Urgent Alert</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                placeholder="Broadcast message to all online StudyHub users..."
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs resize-none"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-dark-950 font-bold text-xs"
              >
                Broadcast to All Users
              </button>
            </form>

            {/* Database Hygiene & Platform Stats */}
            <div className="lg:col-span-5 glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white">Platform Health &amp; Hygiene</h3>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>New Signups (7 days)</span>
                  <strong className="text-white">{stats.recentSignups7d ?? 0}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>Total Rooms Created</span>
                  <strong className="text-white">{stats.totalRooms ?? 0}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>Focused Study Time Platform-Wide</span>
                  <strong className="text-emerald-400">{stats.totalFocusMinutes ?? 0} mins</strong>
                </div>
                <div className="flex justify-between py-1">
                  <span>Active Chat Timeouts</span>
                  <strong className="text-amber-300">{stats.mutedUsers ?? 0}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePurgeGuests}
                className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-rose-500/20 border border-white/15 text-xs font-semibold text-slate-200 hover:text-rose-200 flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clean Up Offline Idle Guests (24h+)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadAdminData();
              }}
              className="flex gap-2 flex-1 min-w-[240px] max-w-md"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search user name, email, username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs"
                />
              </div>
              <button type="submit" className="px-3.5 py-2 rounded-xl bg-brand-purple text-white text-xs font-semibold">
                Search
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {['all', 'registered', 'guests', 'online', 'warned', 'muted', 'banned'].map((f) => (
                <button
                  key={f}
                  onClick={() => setUserFilter(f)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold capitalize border ${
                    userFilter === f
                      ? 'bg-brand-purple/25 border-brand-purple text-white'
                      : 'bg-dark-950/50 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {usersList.map((u) => (
              <div
                key={u.id}
                className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    name={u.name}
                    avatarUrl={u.avatar_url}
                    avatarColor={u.avatar_color}
                    avatarFrame={u.avatar_frame}
                    sizeClass="w-10 h-10 text-sm"
                    statusMode={u.online ? u.statusMode : 'offline'}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{u.name}</span>
                      {u.is_admin && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold uppercase">
                          ADMIN
                        </span>
                      )}
                      {u.is_guest && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-500/25 text-slate-300 text-[9px] font-bold uppercase">
                          GUEST
                        </span>
                      )}
                      {u.is_banned && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-600/30 text-rose-200 text-[9px] font-bold uppercase">
                          BANNED
                        </span>
                      )}
                      {u.is_muted && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px] font-bold uppercase">
                          MUTED
                        </span>
                      )}
                      {(u.warning_count || 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold">
                          {u.warning_count} warn
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {u.email || 'Guest account'} {u.username ? `• @${u.username}` : ''} {u.currentRoomName ? `• In "${u.currentRoomName}"` : ''}
                    </div>
                    {u.is_banned && u.ban_reason && (
                      <div className="text-[10px] text-rose-300 mt-0.5">Ban reason: {u.ban_reason}</div>
                    )}
                  </div>
                </div>

                {!u.is_admin && (
                  <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleInspectHistory(u)}
                      className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-slate-200"
                    >
                      History
                    </button>
                    <button
                      onClick={() => {
                        setWarnTarget(u);
                        setWarnReason('');
                        setWarnSeverity('warning');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" /> Warn
                    </button>
                    {u.is_muted ? (
                      <button
                        onClick={() => handleMuteChat(u, 0)}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold"
                      >
                        Unmute
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMuteChat(u, 60)}
                        title="Mute chat for 60 minutes"
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-amber-500/20 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <VolumeX className="w-3 h-3" /> Mute 1h
                      </button>
                    )}
                    {u.is_banned ? (
                      <button
                        onClick={() => handleUnbanUser(u)}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <UserCheck className="w-3 h-3" /> Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setBanTarget(u);
                          setBanReason('');
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/45 text-rose-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Ban className="w-3 h-3" /> Perm Ban
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(u)}
                      title="Permanently Delete Account"
                      className="px-2.5 py-1.5 rounded-xl bg-dark-950/80 hover:bg-rose-600/35 border border-rose-500/30 text-rose-300 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: GLOBAL SAFETY REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {reportsList.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-xs text-slate-400">
              No reports filed on the platform yet.
            </div>
          ) : (
            reportsList.map((rep) => (
              <div key={rep.id} className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{rep.category}</span>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold uppercase">
                        {rep.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px]">
                        {rep.target_type}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Reporter: <strong className="text-slate-200">{rep.reporter_name || 'Unknown'}</strong> ({rep.reporter_email || 'guest'})
                      {rep.target_user_name && (
                        <> • Target: <strong className="text-amber-300">{rep.target_user_name}</strong> ({rep.target_user_email || 'guest'})</>
                      )}
                      {rep.room_name && <> • Room: <strong className="text-purple-300">{rep.room_name}</strong></>}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      rep.status === 'resolved'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : rep.status === 'dismissed'
                        ? 'bg-slate-500/20 text-slate-400'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {rep.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed">{rep.description}</p>

                {rep.evidence_image && (
                  <img
                    src={rep.evidence_image}
                    alt="Report evidence"
                    className="max-h-48 rounded-xl border border-white/10 object-contain bg-black/40"
                  />
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => handleReportStatus(rep.id, 'resolved', 'Action taken by Platform Admin')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Resolve
                  </button>
                  <button
                    onClick={() => handleReportStatus(rep.id, 'dismissed', 'Reviewed — no policy violation found')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </button>
                  {rep.target_user_id && (
                    <>
                      <button
                        onClick={() => {
                          setWarnTarget({ id: rep.target_user_id, name: rep.target_user_name || 'User' });
                          setWarnReason(`Regarding safety report (${rep.category})`);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" /> Warn Target
                      </button>
                      {!rep.target_is_banned && (
                        <button
                          onClick={() => {
                            setBanTarget({ id: rep.target_user_id, name: rep.target_user_name || 'User' });
                            setBanReason(`Permanent ban from report: ${rep.category}`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/45 text-rose-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" /> Ban Target
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: LIVE ROOMS MONITOR */}
      {activeTab === 'rooms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roomsList.map((room) => (
            <div key={room.id} className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-white truncate">{room.name}</h4>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    {room.liveParticipantsCount}/{room.capacity} live
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Host: <strong className="text-slate-200">{room.host_name || 'Unknown'}</strong> ({room.host_email || 'guest'})
                </div>
                {room.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{room.description}</p>}
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => handleShutdownRoom(room, false)}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold"
                >
                  End &amp; Lock Room
                </button>
                <button
                  onClick={() => handleShutdownRoom(room, true)}
                  className="py-1.5 px-3 rounded-xl bg-rose-600/25 hover:bg-rose-600/45 text-rose-200 text-xs font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 5: AUDIT LEDGER */}
      {activeTab === 'audit' && (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Immutable Admin Audit Logs ({auditLogs.length})</h3>
            <button
              onClick={exportAuditLogs}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No admin actions recorded yet.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-xl bg-dark-950/60 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-brand-purple/20 text-purple-200 font-mono text-[10px] mr-2">
                      {log.action}
                    </span>
                    <span className="text-slate-200">{log.details}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: ISSUE WARNING */}
      {warnTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter">
          <form onSubmit={handleIssueWarning} className="glass-panel modal-panel-enter w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl border border-amber-500/30 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Issue Official Warning to {warnTarget.name}
            </h3>
            <select
              value={warnSeverity}
              onChange={(e) => setWarnSeverity(e.target.value)}
              className="w-full glass-input px-3 py-2 rounded-xl text-xs bg-dark-900 text-white"
            >
              <option value="notice">Friendly Policy Notice</option>
              <option value="warning">Official Warning</option>
              <option value="final_warning">Final Warning Before Ban</option>
            </select>
            <textarea
              required
              rows={3}
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="Explain why this warning is being issued..."
              className="w-full glass-input px-3 py-2 rounded-xl text-xs resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWarnTarget(null)} className="btn-tactile px-4 py-2 rounded-xl text-xs text-slate-400">
                Cancel
              </button>
              <button type="submit" className="btn-tactile px-4 py-2 rounded-xl bg-amber-500 text-dark-950 font-bold text-xs">
                Send Warning
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PERMANENT BAN */}
      {banTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter">
          <form onSubmit={handleBanUser} className="glass-panel modal-panel-enter w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl border border-rose-500/40 space-y-4">
            <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-400" /> Permanently Ban {banTarget.name}?
            </h3>
            <p className="text-xs text-slate-400">
              This will immediately disconnect the user from all rooms/sessions and block future sign-ins.
            </p>
            <textarea
              required
              rows={3}
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for permanent ban..."
              className="w-full glass-input px-3 py-2 rounded-xl text-xs resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBanTarget(null)} className="btn-tactile px-4 py-2 rounded-xl text-xs text-slate-400">
                Cancel
              </button>
              <button type="submit" className="btn-tactile px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs">
                Confirm Permanent Ban
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE USER ACCOUNT */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter">
          <div className="glass-panel modal-panel-enter w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl border border-rose-500/40 space-y-4">
            <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" /> Permanently Delete {deleteTarget.name}?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This erases the user account (<strong className="text-white">{deleteTarget.email || 'Guest account'}</strong>), any rooms they own, direct messages, tasks, and notes. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn-tactile px-4 py-2 rounded-xl text-xs text-slate-400">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="btn-tactile px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
              >
                Delete Account Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: USER INFRACTION HISTORY */}
      {historyTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter" onClick={() => setHistoryTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="glass-panel modal-panel-enter w-full max-w-lg p-5 sm:p-6 rounded-2xl border border-white/15 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Moderation History: {historyTarget.name}</h3>
              <button onClick={() => setHistoryTarget(null)} className="touch-control btn-tactile p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            {!historyData ? (
              <div className="text-xs text-slate-400 py-6 text-center">Loading history...</div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="font-bold text-amber-300 mb-1">Warnings ({historyData.warnings?.length || 0})</div>
                  {(historyData.warnings || []).map((w) => (
                    <div key={w.id} className="p-2 rounded-xl bg-dark-950/60 border border-white/10 mb-1">
                      <span className="uppercase text-[10px] font-bold text-amber-300 mr-2">{w.severity}</span>
                      <span className="text-slate-200">{w.reason}</span>
                    </div>
                  ))}
                  {historyData.warnings?.length === 0 && <p className="text-slate-500">Clean record — no warnings.</p>}
                </div>

                <div>
                  <div className="font-bold text-rose-300 mb-1">Reports Filed Against User ({historyData.reportsAgainst?.length || 0})</div>
                  {(historyData.reportsAgainst || []).map((r) => (
                    <div key={r.id} className="p-2 rounded-xl bg-dark-950/60 border border-white/10 mb-1">
                      <strong className="text-white">{r.category}</strong> ({r.status}): {r.description}
                    </div>
                  ))}
                  {historyData.reportsAgainst?.length === 0 && <p className="text-slate-500">No reports filed against this user.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
