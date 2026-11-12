import React, { useState, useEffect } from 'react';
import {
  Users,
  Lock,
  Plus,
  Star,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  X,
  Trash2,
  Hand,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import { PRESET_COVERS } from '../utils/image';
import { ROOM_THEMES, ROOM_ACCENT_PRESETS } from '../utils/themes';

export function DashboardView({ onJoinRoom, onViewChange, onRequestUpgrade }) {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [rooms, setRooms] = useState([]);
  const [favourites, setFavourites] = useState([]);
  const [taskSummary, setTaskSummary] = useState({ total: 0, completed: 0 });
  const [adminOverviewStats, setAdminOverviewStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Create room modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [roomVibe, setRoomVibe] = useState('Study');
  const [roomMode, setRoomMode] = useState('Group');
  const [roomCover, setRoomCover] = useState(PRESET_COVERS[0].url);
  const [roomTheme, setRoomTheme] = useState('default');
  const [roomThemeAccent, setRoomThemeAccent] = useState('');
  const [roomWaitingRoom, setRoomWaitingRoom] = useState(false);
  const [roomVisibility, setRoomVisibility] = useState('public');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomCapacity, setRoomCapacity] = useState(10);
  const [creating, setCreating] = useState(false);

  // Private room password / knock modal
  const [pendingPrivateRoom, setPendingPrivateRoom] = useState(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [needsKnockRoomId, setNeedsKnockRoomId] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const fetchRooms = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/rooms', { headers });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
        setFavourites(data.favourites || []);
      }
    } catch {}
  };

  const fetchTasksSummary = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.tasks || [];
        setTaskSummary({
          total: list.length,
          completed: list.filter((t) => t.completed).length
        });
      }
    } catch {}
  };

  useEffect(() => {
    fetchRooms();
    fetchTasksSummary();
    if (token && user?.is_admin) {
      fetch('/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.stats) setAdminOverviewStats(d.stats);
        })
        .catch(() => {});
    } else {
      setAdminOverviewStats(null);
    }
  }, [token, user?.id, user?.is_admin]);

  useEffect(() => {
    if (!socket) return;
    const handleCountUpdate = ({ roomId, count }) => {
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, liveParticipantsCount: count } : r)));
    };
    socket.on('room-count-update', handleCountUpdate);
    return () => socket.off('room-count-update', handleCountUpdate);
  }, [socket]);

  const toggleFav = async (e, roomId) => {
    e.stopPropagation();
    if (!token) {
      addToast('Please sign in to favourite rooms', 'info');
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${roomId}/favourite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isFavourite) {
          setFavourites((prev) => [...prev, roomId]);
          addToast('Added to favourite rooms', 'success');
        } else {
          setFavourites((prev) => prev.filter((id) => id !== roomId));
          addToast('Removed from favourites', 'info');
        }
      }
    } catch {}
  };

  const joinRoomWithRecord = async (room, password = '') => {
    if (!token) {
      onJoinRoom(room);
      return true;
    }
    try {
      const res = await fetch(`/api/rooms/${room.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsApproval) {
          setNeedsKnockRoomId(data.roomId);
          return false;
        }
        addToast(data.error || 'Could not join room', 'error');
        return false;
      }
      onJoinRoom(data.room);
      return true;
    } catch {
      addToast('Failed to join room', 'error');
      return false;
    }
  };

  const handleRoomClick = (room) => {
    const isHost = user && room.host_id === user.id;
    if (room.isPrivate && !isHost) {
      setPendingPrivateRoom(room);
      setEnteredPassword('');
    } else {
      joinRoomWithRecord(room);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    let code = joinCode.trim();
    if (!code) return;
    if (code.includes('/')) {
      code = code.split('/').filter(Boolean).pop().split('?')[0];
    }

    if (!user) {
      addToast('Please sign in or join as guest first', 'info');
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data.room) {
        addToast(data.error || 'Room not found — check the invite code', 'error');
        return;
      }
      setJoinCode('');
      handleRoomClick(data.room);
    } catch {
      addToast('Could not look up room code', 'error');
    }
  };

  const handleKnock = async () => {
    if (!needsKnockRoomId || !token) return;
    try {
      const res = await fetch(`/api/rooms/${needsKnockRoomId}/knock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || 'Join request sent to host!', 'success');
        setNeedsKnockRoomId(null);
      }
    } catch {}
  };

  const handleRemoveRoom = async (e, room) => {
    e.stopPropagation();
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${room.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.id !== room.id));
        addToast(room.host_id === user?.id ? 'Room deleted' : 'Removed from your rooms', 'info');
      }
    } catch {
      addToast('Failed to remove room', 'error');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!pendingPrivateRoom) return;
    setVerifying(true);
    try {
      const ok = await joinRoomWithRecord(pendingPrivateRoom, enteredPassword);
      if (ok) setPendingPrivateRoom(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!user) {
      addToast('Please sign in or use guest mode to create rooms', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: roomName,
          description: roomDesc,
          category: roomVibe,
          vibe: roomVibe,
          mode: roomMode,
          theme: roomTheme,
          theme_accent: roomThemeAccent,
          waiting_room: roomWaitingRoom,
          cover_url: roomCover,
          visibility: roomVisibility,
          password: roomPassword,
          capacity: roomCapacity
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');

      addToast(`Room "${data.room.name}" created!`, 'success');
      setShowCreateModal(false);
      setRoomName('');
      setRoomDesc('');
      setRoomPassword('');
      setRoomTheme('default');
      setRoomThemeAccent('');
      setRoomWaitingRoom(false);
      fetchRooms();
      onJoinRoom(data.room);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.vibe && r.vibe.toLowerCase().includes(q)) ||
      (r.category && r.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Guest Safeguard Banner */}
      {user?.is_guest && (
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-100">
            <strong className="text-amber-300 font-bold">Guest Pass Active:</strong>{' '}
            Video, screen share, room chat, room creation &amp; link sharing are restricted for anti-spam safety.
          </div>
          {onRequestUpgrade && (
            <button
              onClick={onRequestUpgrade}
              className="px-4 py-1.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-xs font-bold flex-shrink-0"
            >
              Upgrade to Free Account
            </button>
          )}
        </div>
      )}

      {/* Super-Admin Quick Monitoring Snapshot (Visible ONLY to Hardcoded Admin) */}
      {user?.is_admin && adminOverviewStats && (
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-dark-900/60 to-purple-500/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Admin Telemetry
            </span>
            <div className="flex flex-wrap gap-3 text-xs text-slate-300">
              <span>Users: <strong className="text-white">{adminOverviewStats.totalUsers}</strong></span>
              <span>Online: <strong className="text-emerald-400">{adminOverviewStats.onlineUsersCount}</strong></span>
              <span>Live Rooms: <strong className="text-cyan-400">{adminOverviewStats.activeRoomsCount}</strong></span>
              <span>Open Reports: <strong className="text-rose-400">{adminOverviewStats.openReportsCount}</strong></span>
            </div>
          </div>
          <button
            onClick={() => onViewChange('admin-overview')}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-dark-950 text-xs font-bold transition-colors"
          >
            Open Admin Console →
          </button>
        </div>
      )}

      {/* Today's Progress Card */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/5 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-purple/20 to-brand-blue/20 border border-brand-purple/30 flex items-center justify-center text-brand-purple">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">TODAY&apos;S PROGRESS</span>
            <h4 className="text-lg font-bold text-white mt-0.5">
              {taskSummary.completed} of {taskSummary.total} tasks completed
            </h4>
            {user && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                  🔥 {user.study_streak || 0} day streak
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  ⏱️ {user.total_focus_minutes || 0}m focused
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => onViewChange('tasks')}
          className="px-4 py-2 rounded-xl border border-white/10 hover:border-brand-purple/40 text-slate-300 hover:text-white text-sm font-semibold transition-all self-start sm:self-auto glass-card"
        >
          Manage Tasks
        </button>
      </div>

      {/* Your Rooms Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          Your Rooms
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-medium">
            {filteredRooms.length}
          </span>
        </h3>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 min-w-[170px] sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search your rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl text-sm w-full sm:w-44 focus:sm:w-56 transition-all"
            />
          </div>

          <form onSubmit={handleJoinByCode} className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-[180px]">
            <input
              type="text"
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="glass-input min-h-[38px] px-3 py-1.5 rounded-xl text-sm flex-1 sm:w-36"
            />
            <button
              type="submit"
              className="btn-tactile min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              Join
            </button>
          </form>

          <button
            onClick={() => {
              if (user?.is_guest) {
                onRequestUpgrade?.();
                return;
              }
              setShowCreateModal(true);
            }}
            title={user?.is_guest ? 'Sign up to create your own study rooms' : 'Create a Study Room'}
            className={`btn-tactile w-full sm:w-auto justify-center min-h-[38px] flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md ${
              user?.is_guest
                ? 'bg-white/10 hover:bg-brand-purple/80 border border-amber-500/30 text-amber-200'
                : 'bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 shadow-brand-purple/20'
            }`}
          >
            <Plus className="w-4 h-4" />
            {user?.is_guest ? 'Unlock to Create Room' : 'Create Room'}
          </button>
        </div>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.length === 0 ? (
          <div className="col-span-full py-12 text-center glass-panel rounded-2xl border border-white/5 px-4">
            <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-slate-300 text-sm font-medium">
              {searchQuery
                ? `No rooms matching "${searchQuery}"`
                : 'No rooms yet — only rooms you create or join appear here.'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-slate-500 mt-1">
                Create a new study room or enter an invite code above to join someone else&apos;s room.
              </p>
            )}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isFav = favourites.includes(room.id);
            const isFull = room.liveParticipantsCount >= room.capacity;
            const isCreator = user && room.host_id === user.id;
            const themeMeta = ROOM_THEMES[room.theme] || ROOM_THEMES.default;

            return (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room)}
                className="glass-panel card-interactive rounded-2xl border border-white/5 hover:border-brand-purple/40 cursor-pointer flex flex-col justify-between group shadow-lg overflow-hidden"
              >
                {/* Cover Banner Header */}
                {room.cover_url ? (
                  <div className="h-24 w-full overflow-hidden relative bg-dark-950">
                    <img src={room.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900/90 to-transparent" />
                  </div>
                ) : (
                  <div className="h-3 w-full" style={{ background: themeMeta.swatch }} />
                )}

                <div className={`p-4 flex-1 flex flex-col justify-between bg-gradient-to-br ${themeMeta.bgGradient}`}>
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${themeMeta.badgeClass}`}>
                        {room.vibe || room.category || 'Study'} · {room.mode || 'Group'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => toggleFav(e, room.id)}
                          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                          className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => handleRemoveRoom(e, room)}
                          title={isCreator ? 'Delete room' : 'Remove from list'}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="text-base font-bold text-white group-hover:text-brand-purple transition-colors flex items-center gap-1.5 mb-1">
                      {room.name}
                      {room.isPrivate && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      {room.waiting_room && <Hand className="w-3.5 h-3.5 text-amber-400" title="Waiting Room Active" />}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {room.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className={room.liveParticipantsCount > 0 ? 'text-emerald-400 font-medium' : ''}>
                        {room.liveParticipantsCount}/{room.capacity}
                      </span>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                        isFull
                          ? 'bg-white/5 text-slate-500'
                          : 'bg-brand-purple/20 text-brand-purple group-hover:bg-brand-purple group-hover:text-white transition-all'
                      }`}
                    >
                      {isFull ? 'Full' : 'Join'}
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Create Room */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md modal-backdrop-enter">
          <div className="glass-panel modal-panel-enter w-full max-w-md p-5 sm:p-6 rounded-2xl shadow-2xl relative border border-white/10 max-h-[90dvh] overflow-y-auto">
            <button onClick={() => setShowCreateModal(false)} className="touch-control btn-tactile absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-4">Create a Study Room</h3>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Cover Preset</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRESET_COVERS.map((cov) => (
                    <button
                      key={cov.id}
                      type="button"
                      onClick={() => setRoomCover(cov.url)}
                      className={`rounded-lg overflow-hidden border-2 transition-all ${
                        roomCover === cov.url ? 'border-brand-purple scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={cov.url} alt={cov.label} className="w-full h-10 object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Room Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. study buddies"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                  maxLength={60}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Description</label>
                <input
                  type="text"
                  placeholder="What are people studying here?"
                  value={roomDesc}
                  onChange={(e) => setRoomDesc(e.target.value)}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Vibe</label>
                  <select
                    value={roomVibe}
                    onChange={(e) => setRoomVibe(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="Chill">Chill</option>
                    <option value="Study">Study</option>
                    <option value="Work">Work</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Mode</label>
                  <select
                    value={roomMode}
                    onChange={(e) => setRoomMode(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="Group">Group</option>
                    <option value="Stream">Stream</option>
                    <option value="Focus">Focus</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Visibility</label>
                  <select
                    value={roomVisibility}
                    onChange={(e) => setRoomVisibility(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm bg-dark-900 text-white"
                  >
                    <option value="public">Open</option>
                    <option value="private">Locked (Password)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Capacity</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={roomCapacity}
                    onChange={(e) => setRoomCapacity(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Room Theme</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {Object.values(ROOM_THEMES).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setRoomTheme(t.id)}
                      className={`p-1.5 rounded-xl border text-left flex items-center gap-1.5 transition-all ${
                        roomTheme === t.id
                          ? 'border-white bg-white/10 text-white'
                          : 'border-white/10 bg-dark-900/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: t.swatch }} />
                      <span className="text-[10px] font-semibold truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Background Accent Color</label>
                  {roomThemeAccent && (
                    <button
                      type="button"
                      onClick={() => setRoomThemeAccent('')}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Reset to theme default
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ROOM_ACCENT_PRESETS.filter((p) => p.hex).map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setRoomThemeAccent(preset.hex)}
                      title={preset.label}
                      style={{ backgroundColor: preset.hex }}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        roomThemeAccent === preset.hex ? 'scale-125 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                      }`}
                    />
                  ))}
                  <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-dark-900 border border-white/10 text-[10px] text-slate-300 cursor-pointer">
                    Custom
                    <input
                      type="color"
                      value={roomThemeAccent || ROOM_THEMES[roomTheme]?.defaultAccent || '#8b5cf6'}
                      onChange={(e) => setRoomThemeAccent(e.target.value)}
                      className="w-5 h-4 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={roomWaitingRoom}
                  onChange={(e) => setRoomWaitingRoom(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                Enable Waiting Room (Host/Admin must admit new members)
              </label>

              {roomVisibility === 'private' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Room Password (optional — leave blank to require Host Admit)
                  </label>
                  <input
                    type="password"
                    placeholder="Password or leave empty for knock-to-join"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white font-semibold text-sm transition-all shadow-md shadow-brand-purple/20 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Room'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Private Room Password */}
      {pendingPrivateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md modal-backdrop-enter">
          <div className="glass-panel modal-panel-enter w-full max-w-sm max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl shadow-2xl relative border border-white/10">
            <button onClick={() => setPendingPrivateRoom(null)} className="touch-control btn-tactile absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-2">Join &ldquo;{pendingPrivateRoom.name}&rdquo;</h3>
            <p className="text-xs text-slate-400 mb-4">This room is locked. Enter the password or ask the host to admit you.</p>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Enter password (if set)"
                value={enteredPassword}
                onChange={(e) => setEnteredPassword(e.target.value)}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                autoFocus
              />
              <button
                type="submit"
                disabled={verifying}
                className="btn-tactile w-full py-2.5 px-4 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-sm"
              >
                {verifying ? 'Verifying...' : 'Join Room'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Locked Room Knock / Request to Join */}
      {needsKnockRoomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md modal-backdrop-enter">
          <div className="glass-panel modal-panel-enter w-full max-w-sm max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl shadow-2xl relative border border-white/10 text-center space-y-4">
            <Hand className="w-10 h-10 text-amber-400 mx-auto" />
            <h4 className="text-lg font-bold text-white">Ask to Join?</h4>
            <p className="text-xs text-slate-400">
              Waiting Room or host lock is active for this room. Send a request so the owner or an admin can admit you.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setNeedsKnockRoomId(null)}
                className="btn-tactile touch-control flex-1 py-2.5 rounded-xl bg-white/10 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleKnock}
                className="btn-tactile touch-control flex-1 py-2.5 rounded-xl bg-brand-purple text-white text-xs font-semibold"
              >
                Ask to Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
