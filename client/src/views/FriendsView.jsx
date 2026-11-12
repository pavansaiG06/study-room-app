import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  UserPlus,
  Check,
  X,
  Search,
  Clock,
  MessageSquare,
  Send,
  Ban,
  ArrowRight,
  ArrowLeft,
  Video
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import { UserAvatar } from '../components/UserAvatar';
import { UserPopoutCard } from '../components/UserPopoutCard';
import { getActivityMeta } from '../utils/themes';

export function FriendsView({ onJoinRoom, onNavigate, onRequestUpgrade }) {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('online'); // 'online' | 'all' | 'pending' | 'blocked' | 'find'
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [blocked, setBlocked] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [requestNotes, setRequestNotes] = useState({});
  const [searching, setSearching] = useState(false);

  // Direct Messaging panel
  const [activeDmFriend, setActiveDmFriend] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmInput, setDmInput] = useState('');
  const [popoutUserId, setPopoutUserId] = useState(null);
  const dmBottomRef = useRef(null);

  const fetchFriends = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
        setBlocked(data.blocked || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchFriends();
  }, [token]);

  // Listen to real-time presence updates & incoming DMs
  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (p) => {
      setFriends((prev) =>
        prev.map((f) =>
          f.id === p.userId
            ? {
                ...f,
                online: p.online !== undefined ? p.online : f.online,
                liveStatusMode: p.online === false ? 'offline' : p.statusMode || f.liveStatusMode,
                liveStatusText: p.statusText !== undefined ? p.statusText : f.liveStatusText,
                currentRoomId: p.currentRoomId !== undefined ? p.currentRoomId : f.currentRoomId,
                currentRoomName: p.currentRoomName !== undefined ? p.currentRoomName : f.currentRoomName,
                listening: p.listening !== undefined ? p.listening : f.listening,
                avatar_url: p.avatarUrl !== undefined ? p.avatarUrl : f.avatar_url
              }
            : f
        )
      );
    };

    const handleDmReceived = (msg) => {
      if (activeDmFriend && (msg.sender_id === activeDmFriend.id || msg.receiver_id === activeDmFriend.id)) {
        setDmMessages((prev) => [...prev, msg]);
      } else {
        addToast(`New message from ${msg.senderName}`, 'info');
      }
    };

    socket.on('presence-update', handlePresenceUpdate);
    socket.on('dm-received', handleDmReceived);

    return () => {
      socket.off('presence-update', handlePresenceUpdate);
      socket.off('dm-received', handleDmReceived);
    };
  }, [socket, activeDmFriend?.id]);

  // Load DM history when friend selected
  useEffect(() => {
    if (!activeDmFriend || !token) return;
    fetch(`/api/messages/${activeDmFriend.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((d) => setDmMessages(d.messages || []))
      .catch(() => {});
  }, [activeDmFriend?.id, token]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !token) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch {
      addToast('Search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (targetUserId, targetName) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId, note: requestNotes[targetUserId] || '' })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || `Request sent to ${targetName}`, 'success');
        fetchFriends();
      } else {
        addToast(data.error || 'Failed to send request', 'error');
      }
    } catch {}
  };

  const respondRequest = async (requestId, action) => {
    try {
      const res = await fetch(`/api/friends/${requestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        addToast(action === 'accept' ? 'Friend request accepted!' : 'Request declined', 'info');
        fetchFriends();
      }
    } catch {}
  };

  const removeFriend = async (friendshipId) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFriends((prev) => prev.filter((f) => f.friendship_id !== friendshipId));
        addToast('Friend removed', 'info');
      }
    } catch {}
  };

  const unblockUser = async (targetId) => {
    try {
      const res = await fetch(`/api/friends/block/${targetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setBlocked((prev) => prev.filter((b) => b.id !== targetId));
        addToast('User unblocked', 'info');
      }
    } catch {}
  };

  const handleSendDm = async (e) => {
    e.preventDefault();
    if (!dmInput.trim() || !activeDmFriend || !token) return;
    try {
      const res = await fetch(`/api/messages/${activeDmFriend.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: dmInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setDmMessages((prev) => [...prev, data.message]);
        setDmInput('');
      } else {
        addToast(data.error || 'Could not send DM', 'error');
      }
    } catch {}
  };

  const onlineFriends = friends.filter((f) => f.online);
  const displayedFriends = activeTab === 'online' ? onlineFriends : friends;

  if (user?.is_guest) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="glass-panel p-8 rounded-3xl border border-amber-500/25 text-center space-y-4">
          <Users className="w-12 h-12 text-amber-400 mx-auto" />
          <h3 className="text-xl font-bold text-white">Friends &amp; Direct Messages Locked</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Guest accounts are restricted from searching users, sending friend requests, and Direct Messaging to protect student privacy and prevent spam.
          </p>
          {onRequestUpgrade && (
            <button
              onClick={onRequestUpgrade}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue text-white text-xs font-bold shadow-lg"
            >
              Create Free Account to Unlock Friends &amp; DMs
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-2 flex flex-col lg:flex-row gap-5">
      {/* Left Main Social List */}
      <div className="flex-1 min-w-0 space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-purple" />
            Friends &amp; Direct Messages
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            See who&apos;s studying live, jump into their room, or message directly.
          </p>
        </div>

        {/* Discord-Style Tabs */}
        <div className="flex border-b border-white/10 gap-2 sm:gap-5 overflow-x-auto no-scrollbar">
          {[
            ['online', `Online (${onlineFriends.length})`],
            ['all', `All (${friends.length})`],
            ['pending', `Pending${incoming.length > 0 ? ` (${incoming.length})` : ''}`],
            ['blocked', `Blocked (${blocked.length})`],
            ['find', 'Add Friend']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`btn-tactile touch-control px-1 pb-3 pt-1 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === id
                  ? 'text-brand-purple border-b-2 border-brand-purple'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div key={activeTab} className="animate-fade-in">
        {/* Tab: Online / All Friends */}
        {(activeTab === 'online' || activeTab === 'all') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedFriends.length === 0 ? (
              <div className="col-span-full p-8 text-center glass-panel rounded-2xl border border-white/5">
                <p className="text-sm text-slate-400">
                  {activeTab === 'online'
                    ? 'None of your friends are online right now.'
                    : 'No friends added yet. Click "Add Friend" to find study partners!'}
                </p>
              </div>
            ) : (
              displayedFriends.map((f) => (
                <div
                  key={f.id}
                  className="glass-panel card-interactive p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3 shadow-md hover:border-white/15 transition-colors"
                >
                  <div
                    onClick={() => setPopoutUserId(f.id)}
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                  >
                    <UserAvatar
                      name={f.name}
                      avatarUrl={f.avatar_url}
                      avatarColor={f.avatar_color}
                      avatarFrame={f.avatar_frame}
                      sizeClass="w-10 h-10 text-sm"
                      statusMode={f.liveStatusMode}
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{f.name}</h4>
                      {f.currentRoomName ? (
                        <span className="text-[11px] text-emerald-400 font-medium block truncate">
                          Studying in &ldquo;{f.currentRoomName}&rdquo;
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 block truncate">
                          {f.liveStatusText || (f.username ? `@${f.username}` : getActivityMeta(f.liveStatusMode).shortLabel)}
                        </span>
                      )}
                      {f.listening && (
                        <span className="text-[10px] text-emerald-300/90 font-medium block truncate mt-0.5">
                          {f.listening.isSong ? '🎵' : '📺'} {f.listening.trackTitle || f.listening.title}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {f.currentRoomId && onJoinRoom && (
                      <button
                        onClick={() => onJoinRoom({ id: f.currentRoomId, name: f.currentRoomName })}
                        title="Join friend's room"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                      >
                        <Video className="w-3.5 h-3.5" /> Join
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('dms', { friendId: f.id });
                        } else {
                          setActiveDmFriend(f);
                        }
                      }}
                      title="Direct Message"
                      className={`p-2 rounded-xl transition-colors ${
                        activeDmFriend?.id === f.id
                          ? 'bg-brand-purple text-white'
                          : 'bg-white/5 hover:bg-white/15 text-slate-300'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => removeFriend(f.friendship_id)}
                      title="Remove Friend"
                      className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Pending Requests */}
        {activeTab === 'pending' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Incoming Requests</h4>
              {incoming.length === 0 ? (
                <p className="text-xs text-slate-500">No pending incoming friend requests.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {incoming.map((req) => (
                    <div
                      key={req.request_id}
                      className="glass-panel p-3.5 rounded-2xl border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar name={req.name} avatarUrl={req.avatar_url} avatarColor={req.avatar_color} sizeClass="w-9 h-9 text-xs" />
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-white block truncate">{req.name}</span>
                          {req.note ? (
                            <span className="text-[11px] text-brand-purple block truncate">&ldquo;{req.note}&rdquo;</span>
                          ) : (
                            <span className="text-xs text-slate-400 block truncate">
                              {req.username ? `@${req.username}` : req.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => respondRequest(req.request_id, 'accept')}
                          className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => respondRequest(req.request_id, 'decline')}
                          className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {outgoing.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sent Requests</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {outgoing.map((req) => (
                    <div key={req.request_id} className="p-3 rounded-xl bg-dark-900/50 border border-white/5 flex items-center justify-between text-xs text-slate-400">
                      <span>Request sent to <strong className="text-white">{req.name}</strong></span>
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Blocked Users */}
        {activeTab === 'blocked' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {blocked.length === 0 ? (
              <div className="col-span-full p-8 text-center glass-panel rounded-2xl border border-white/5 text-sm text-slate-400">
                You haven&apos;t blocked anyone.
              </div>
            ) : (
              blocked.map((b) => (
                <div key={b.id} className="glass-panel p-3.5 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={b.name} avatarUrl={b.avatar_url} avatarColor={b.avatar_color} sizeClass="w-9 h-9 text-xs" />
                    <div>
                      <div className="text-sm font-bold text-white">{b.name}</div>
                      <div className="text-xs text-rose-400 flex items-center gap-1"><Ban className="w-3 h-3" /> Blocked</div>
                    </div>
                  </div>
                  <button
                    onClick={() => unblockUser(b.id)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Find People */}
        {activeTab === 'find' && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Search by name, @username, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 glass-input px-4 py-2.5 rounded-2xl text-sm"
              />
              <button
                type="submit"
                disabled={searching}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-sm flex-shrink-0"
              >
                <Search className="w-4 h-4" /> Search
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map((foundUser) => (
                <div key={foundUser.id} className="glass-panel p-4 rounded-2xl border border-white/5 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={foundUser.name}
                        avatarUrl={foundUser.avatar_url}
                        avatarColor={foundUser.avatar_color}
                        sizeClass="w-9 h-9 text-xs"
                      />
                      <div className="min-w-0">
                        <h5 className="text-sm font-bold text-white truncate">{foundUser.name}</h5>
                        <span className="text-xs text-slate-400 block truncate">
                          {foundUser.username ? `@${foundUser.username}` : foundUser.email || 'Student'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => sendRequest(foundUser.id, foundUser.name)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-purple/20 hover:bg-brand-purple text-brand-purple hover:text-white text-xs font-semibold transition-all flex-shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>

                  {/* Optional Discord-style context note */}
                  <input
                    type="text"
                    placeholder="Add optional note (e.g., Met in STEM room)"
                    value={requestNotes[foundUser.id] || ''}
                    onChange={(e) => setRequestNotes((prev) => ({ ...prev, [foundUser.id]: e.target.value }))}
                    maxLength={120}
                    className="w-full glass-input px-3 py-1.5 rounded-xl text-[11px]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Right Direct Message Panel (Full-screen/Drawer sheet on mobile/tablet, side panel on desktop) */}
      {activeDmFriend && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden modal-backdrop-enter"
            onClick={() => setActiveDmFriend(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-96 z-50 lg:static lg:z-auto lg:w-80 xl:w-96 bg-dark-900/95 lg:bg-dark-900/70 backdrop-blur-xl rounded-none sm:rounded-l-2xl lg:rounded-2xl border-l lg:border border-white/10 flex flex-col h-[100dvh] lg:h-[calc(100dvh-11rem)] flex-shrink-0 overflow-hidden shadow-2xl modal-panel-enter">
            <div className="p-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] lg:pt-3.5 border-b border-white/10 flex items-center justify-between gap-2 bg-dark-950/60">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setActiveDmFriend(null)}
                  className="lg:hidden touch-control btn-tactile p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                  title="Back to friends"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div
                  onClick={() => setPopoutUserId(activeDmFriend.id)}
                  className="flex items-center gap-2.5 cursor-pointer min-w-0"
                >
                  <UserAvatar
                    name={activeDmFriend.name}
                    avatarUrl={activeDmFriend.avatar_url}
                    avatarColor={activeDmFriend.avatar_color}
                    sizeClass="w-8 h-8 text-xs"
                    statusMode={activeDmFriend.liveStatusMode}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{activeDmFriend.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">Direct Message</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveDmFriend(null)}
                className="touch-control btn-tactile p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
              {dmMessages.length === 0 ? (
                <div className="text-center text-slate-500 py-10 text-xs">
                  Say hello to {activeDmFriend.name}!
                </div>
              ) : (
                dmMessages.map((msg) => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex flex-col animate-chat-msg ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-3 py-1.5 rounded-2xl max-w-[85%] break-words ${
                          isMe
                            ? 'bg-brand-purple text-white rounded-br-none'
                            : 'bg-dark-800 text-slate-200 rounded-bl-none border border-white/5'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 px-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={dmBottomRef} />
            </div>

            <form
              onSubmit={handleSendDm}
              className="p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] border-t border-white/10 flex gap-1.5 bg-dark-950/50"
            >
              <input
                type="text"
                placeholder={`Message ${activeDmFriend.name}...`}
                value={dmInput}
                onChange={(e) => setDmInput(e.target.value)}
                className="flex-1 min-h-[40px] glass-input px-3 py-2 rounded-xl text-xs"
                maxLength={1000}
              />
              <button
                type="submit"
                className="btn-tactile touch-control p-2 px-3 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </>
      )}

      {/* User Popout Card */}
      {popoutUserId && (
        <UserPopoutCard
          targetUserId={popoutUserId}
          onClose={() => setPopoutUserId(null)}
          onOpenDM={(prof) => setActiveDmFriend(prof)}
        />
      )}
    </div>
  );
}
