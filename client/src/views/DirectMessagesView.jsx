import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Pin,
  VolumeX,
  Volume2,
  MoreVertical,
  UserMinus,
  Ban,
  ArrowLeft,
  Smile,
  ShieldAlert,
  Video,
  Clock,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import { UserAvatar } from '../components/UserAvatar';
import { UserPopoutCard } from '../components/UserPopoutCard';
import { EmojiPicker } from '../components/EmojiPicker';
import { getActivityMeta } from '../utils/themes';

export function DirectMessagesView({ initialFriendId, onJoinRoom, onNavigate, onRequestUpgrade }) {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [friends, setFriends] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [popoutUser, setPopoutUser] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Pinned DMs & Muted DMs stored locally
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('studyhub_pinned_dms')) || [];
    } catch {
      return [];
    }
  });

  const [mutedIds, setMutedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('studyhub_muted_dms')) || [];
    } catch {
      return [];
    }
  });

  const chatBottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('studyhub_pinned_dms', JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  useEffect(() => {
    localStorage.setItem('studyhub_muted_dms', JSON.stringify(mutedIds));
  }, [mutedIds]);

  // Load Friends List for DMs
  const fetchFriends = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.friends || [];
        setFriends(list);

        if (initialFriendId) {
          const match = list.find((f) => f.id === initialFriendId);
          if (match) setActiveFriend(match);
        } else if (!activeFriend && list.length > 0) {
          // Select first pinned or first friend by default
          const defaultFriend = list.find((f) => pinnedIds.includes(f.id)) || list[0];
          setActiveFriend(defaultFriend);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchFriends();
  }, [token, initialFriendId]);

  // Listen for real-time presence & incoming DMs
  useEffect(() => {
    if (!socket) return;

    const handlePresence = (p) => {
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

    const handleDm = (msg) => {
      if (activeFriend && (msg.sender_id === activeFriend.id || msg.receiver_id === activeFriend.id)) {
        setMessages((prev) => [...prev, msg]);
      } else {
        const isMuted = mutedIds.includes(msg.sender_id);
        if (!isMuted) {
          addToast(`DM from ${msg.senderName}: "${msg.text.slice(0, 40)}"`, 'info');
        }
      }
    };

    socket.on('presence-update', handlePresence);
    socket.on('dm-received', handleDm);

    return () => {
      socket.off('presence-update', handlePresence);
      socket.off('dm-received', handleDm);
    };
  }, [socket, activeFriend?.id, mutedIds]);

  // Load message history with active friend
  useEffect(() => {
    if (!activeFriend || !token) return;
    fetch(`/api/messages/${activeFriend.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
  }, [activeFriend?.id, token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeFriend || !token) return;
    const textToSend = input.trim();
    setInput('');
    setShowEmojiPicker(false);

    try {
      const res = await fetch(`/api/messages/${activeFriend.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: textToSend })
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        addToast(data.error || 'Could not send message', 'error');
      }
    } catch {
      addToast('Message failed to send', 'error');
    }
  };

  const togglePin = (friendId) => {
    setPinnedIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [friendId, ...prev]
    );
    addToast(pinnedIds.includes(friendId) ? 'Chat unpinned' : 'Chat pinned to top', 'info');
    setMenuOpenId(null);
  };

  const toggleMute = (friendId) => {
    setMutedIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
    addToast(mutedIds.includes(friendId) ? 'Notifications unmuted' : 'Conversation muted', 'info');
    setMenuOpenId(null);
  };

  const handleRemoveFriend = async (friendshipId, name) => {
    if (!confirm(`Are you sure you want to remove ${name} from your friends?`)) return;
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFriends((prev) => prev.filter((f) => f.friendship_id !== friendshipId));
        if (activeFriend?.friendship_id === friendshipId) {
          setActiveFriend(null);
        }
        addToast(`${name} removed from friends`, 'info');
      }
    } catch {}
    setMenuOpenId(null);
  };

  const handleBlockUser = async (targetUserId, name) => {
    if (!confirm(`Block ${name}? They will no longer be able to message you or see your online status.`)) return;
    try {
      const res = await fetch('/api/friends/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        setFriends((prev) => prev.filter((f) => f.id !== targetUserId));
        if (activeFriend?.id === targetUserId) {
          setActiveFriend(null);
        }
        addToast(`${name} blocked`, 'info');
      }
    } catch {}
    setMenuOpenId(null);
  };

  // Sort friends: pinned first, then online, then alphabetized
  const filteredFriends = friends.filter((f) =>
    (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.username || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const aPin = pinnedIds.includes(a.id) ? 1 : 0;
    const bPin = pinnedIds.includes(b.id) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    if (a.online !== b.online) return (b.online ? 1 : 0) - (a.online ? 1 : 0);
    return (a.name || '').localeCompare(b.name || '');
  });

  if (user?.is_guest) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="glass-panel p-8 rounded-3xl border border-amber-500/25 text-center space-y-4">
          <MessageSquare className="w-12 h-12 text-amber-400 mx-auto" />
          <h3 className="text-xl font-bold text-white">Direct Messages Locked</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Guest accounts cannot use Direct Messages to protect community privacy and prevent spam.
          </p>
          {onRequestUpgrade && (
            <button
              onClick={onRequestUpgrade}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue text-white text-xs font-bold shadow-lg"
            >
              Create Free Account to Unlock DMs
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-5.5rem)] flex flex-col md:flex-row gap-3 overflow-hidden">
      {/* LEFT COLUMN: CONVERSATION LIST */}
      <div
        className={`w-full md:w-80 lg:w-96 glass-panel rounded-2xl sm:rounded-3xl border border-white/10 flex flex-col flex-shrink-0 overflow-hidden ${
          activeFriend ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header & Search */}
        <div className="p-3.5 border-b border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand-purple/20 text-brand-purple flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-white">Direct Messages</h2>
            </div>
            <button
              onClick={() => onNavigate?.('friends')}
              className="text-[11px] font-semibold text-brand-purple hover:underline"
            >
              Add Friends
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input pl-8 pr-3 py-1.5 rounded-xl text-xs text-white placeholder-slate-400"
            />
          </div>
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          {sortedFriends.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400 font-medium">No conversations yet</p>
              <button
                onClick={() => onNavigate?.('friends')}
                className="px-3 py-1.5 rounded-xl bg-brand-purple/20 text-brand-purple border border-brand-purple/30 text-xs font-semibold hover:bg-brand-purple/30"
              >
                Find &amp; Add Friends
              </button>
            </div>
          ) : (
            sortedFriends.map((friend) => {
              const isSelected = activeFriend?.id === friend.id;
              const isPinned = pinnedIds.includes(friend.id);
              const isMuted = mutedIds.includes(friend.id);
              const statusMeta = getActivityMeta(friend.liveStatusMode || (friend.online ? 'online' : 'offline'));

              return (
                <div
                  key={friend.id}
                  onClick={() => setActiveFriend(friend)}
                  className={`group relative flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-purple/25 border border-brand-purple/40 text-white shadow-md'
                      : 'hover:bg-white/5 border border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <UserAvatar
                      name={friend.name}
                      avatarUrl={friend.avatar_url}
                      avatarColor={friend.avatar_color}
                      avatarFrame={friend.avatar_frame}
                      sizeClass="w-10 h-10 text-sm"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-950 ${statusMeta.color}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs truncate">{friend.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isPinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400" />}
                        {isMuted && <VolumeX className="w-3 h-3 text-slate-400" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate mt-0.5">
                      {friend.listening ? (
                        <span className="text-emerald-300 truncate">
                          🎵 {friend.listening.trackTitle || friend.listening.title}
                        </span>
                      ) : friend.currentRoomName ? (
                        <span className="text-sky-300 truncate">In: {friend.currentRoomName}</span>
                      ) : (
                        <span className="truncate">@{friend.username || 'user'}</span>
                      )}
                    </div>
                  </div>

                  {/* 3-Dot Conversation Menu */}
                  <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setMenuOpenId((prev) => (prev === friend.id ? null : friend.id))}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-white transition-opacity"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {menuOpenId === friend.id && (
                      <div className="animate-popover-in absolute right-0 top-full mt-1 w-44 rounded-xl glass-panel border border-white/15 shadow-2xl p-1 z-30 space-y-0.5 text-xs">
                        <button
                          onClick={() => togglePin(friend.id)}
                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2 text-left"
                        >
                          <Pin className="w-3.5 h-3.5 text-amber-400" />
                          {isPinned ? 'Unpin Conversation' : 'Pin Conversation'}
                        </button>
                        <button
                          onClick={() => toggleMute(friend.id)}
                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2 text-left"
                        >
                          {isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                          {isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                        </button>
                        <button
                          onClick={() => {
                            setPopoutUser(friend);
                            setMenuOpenId(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2 text-left"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-brand-purple" />
                          View Profile
                        </button>
                        <div className="border-t border-white/10 my-0.5" />
                        <button
                          onClick={() => handleRemoveFriend(friend.friendship_id, friend.name)}
                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-300 flex items-center gap-2 text-left"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          Remove Friend
                        </button>
                        <button
                          onClick={() => handleBlockUser(friend.id, friend.name)}
                          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-300 flex items-center gap-2 text-left"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Block User
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: CHAT WINDOW */}
      <div
        className={`flex-1 glass-panel rounded-2xl sm:rounded-3xl border border-white/10 flex flex-col overflow-hidden ${
          !activeFriend ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeFriend ? (
          <>
            {/* Chat Top Header */}
            <div className="p-3 sm:p-3.5 border-b border-white/10 flex items-center justify-between gap-3 bg-dark-950/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setActiveFriend(null)}
                  className="md:hidden p-1.5 rounded-xl hover:bg-white/10 text-slate-300"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div
                  onClick={() => setPopoutUser(activeFriend)}
                  className="cursor-pointer flex items-center gap-2.5 min-w-0"
                >
                  <UserAvatar
                    name={activeFriend.name}
                    avatarUrl={activeFriend.avatar_url}
                    avatarColor={activeFriend.avatar_color}
                    avatarFrame={activeFriend.avatar_frame}
                    sizeClass="w-9 h-9 text-xs"
                  />
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                      {activeFriend.name}
                      {pinnedIds.includes(activeFriend.id) && (
                        <Pin className="w-3 h-3 text-amber-400 fill-amber-400" />
                      )}
                    </h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeFriend.online ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                      <span className="capitalize">{activeFriend.online ? 'Online' : 'Offline'}</span>
                      {activeFriend.listening && (
                        <span className="text-emerald-300 font-medium truncate">
                          • {activeFriend.listening.trackTitle || activeFriend.listening.title}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {activeFriend.currentRoomId && (
                  <button
                    onClick={() => onJoinRoom?.(activeFriend.currentRoomId)}
                    className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 text-xs font-semibold flex items-center gap-1"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Join Room
                  </button>
                )}

                <button
                  onClick={() => togglePin(activeFriend.id)}
                  title={pinnedIds.includes(activeFriend.id) ? 'Unpin' : 'Pin to top'}
                  className={`p-2 rounded-xl border border-white/10 transition-colors ${
                    pinnedIds.includes(activeFriend.id)
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => toggleMute(activeFriend.id)}
                  title={mutedIds.includes(activeFriend.id) ? 'Unmute' : 'Mute conversation'}
                  className={`p-2 rounded-xl border border-white/10 transition-colors ${
                    mutedIds.includes(activeFriend.id)
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {mutedIds.includes(activeFriend.id) ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-16 space-y-2 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-brand-purple/20 text-brand-purple flex items-center justify-center mx-auto mb-2">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">This is the start of your message history with {activeFriend.name}</h4>
                  <p className="text-xs text-slate-500">Say hi or share notes and study tips!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === user.id;
                  const time = new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 max-w-[85%] sm:max-w-[75%] ${
                        isMine ? 'ml-auto flex-row-reverse' : ''
                      }`}
                    >
                      {!isMine && (
                        <div
                          onClick={() => setPopoutUser(activeFriend)}
                          className="cursor-pointer flex-shrink-0"
                        >
                          <UserAvatar
                            name={activeFriend.name}
                            avatarUrl={activeFriend.avatar_url}
                            avatarColor={activeFriend.avatar_color}
                            sizeClass="w-7 h-7 text-[10px]"
                          />
                        </div>
                      )}

                      <div>
                        <div
                          className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                            isMine
                              ? 'bg-brand-purple text-white rounded-br-sm shadow-md'
                              : 'bg-dark-900/80 text-slate-100 rounded-bl-sm border border-white/10'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <div
                          className={`text-[9px] text-slate-400 mt-0.5 px-1 ${
                            isMine ? 'text-right' : 'text-left'
                          }`}
                        >
                          {time}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Message Input Box with Emoji Picker */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 flex gap-2 relative bg-dark-950/60">
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  title="Insert emoji"
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
                >
                  <Smile className="w-4 h-4" />
                </button>

                {showEmojiPicker && (
                  <EmojiPicker
                    onSelectEmoji={(em) => {
                      setInput((prev) => prev + em);
                      setShowEmojiPicker(false);
                    }}
                    onClose={() => setShowEmojiPicker(false)}
                    align="top"
                  />
                )}
              </div>

              <input
                type="text"
                placeholder={`Message @${activeFriend.name}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 glass-input px-3.5 py-2 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
                maxLength={1000}
                autoFocus
              />

              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 rounded-xl bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-40 text-white font-semibold text-xs flex items-center justify-center gap-1 shadow-md transition-all flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-brand-purple/15 text-brand-purple flex items-center justify-center">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">Your Direct Messages</h3>
            <p className="text-xs max-w-sm text-slate-400 leading-relaxed">
              Select a friend from the left sidebar to start chatting, or add new study partners from the Friends tab.
            </p>
          </div>
        )}
      </div>

      {/* User Popout Card */}
      {popoutUser && (
        <UserPopoutCard
          userId={popoutUser.id}
          onClose={() => setPopoutUser(null)}
          onJoinRoom={onJoinRoom}
        />
      )}
    </div>
  );
}
