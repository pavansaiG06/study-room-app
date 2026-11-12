const crypto = require('crypto');
const { dbAsync } = require('./db');

// Live room state: roomId -> roomState
const liveRooms = new Map();

// Global online presence: userId -> { sockets: Set<string>, statusMode, statusText, customEmoji, currentRoomId, currentRoomName }
const onlineUsers = new Map();

function getLiveRoom(roomId) {
  if (!liveRooms.has(roomId)) {
    liveRooms.set(roomId, {
      id: roomId,
      participants: new Map(), // socketId -> participantInfo
      chat: [],
      focus: {
        isRunning: false,
        endsAt: null,
        minutes: 25
      },
      pinnedSocketId: null,
      goals: [],
      strokes: [],
      youtube: {
        url: '',
        isPlaying: false,
        updatedAt: Date.now()
      }
    });
  }
  return liveRooms.get(roomId);
}

function getParticipantCount(roomId) {
  if (!liveRooms.has(roomId)) return 0;
  return liveRooms.get(roomId).participants.size;
}

function getLiveParticipants(roomId) {
  if (!liveRooms.has(roomId)) return [];
  return Array.from(liveRooms.get(roomId).participants.values());
}

function addParticipant(roomId, socketId, user, role = 'member', roomPerms = {}) {
  const room = getLiveRoom(roomId);
  const isGuest = !!user.is_guest;
  const isOwner = !isGuest && role === 'owner';
  const isAdmin = !isGuest && role === 'admin';
  const isPrivileged = isOwner || isAdmin;
  const canAudio = isPrivileged || (roomPerms.allow_mic !== false && roomPerms.allow_mic !== 0);
  const canVideo = !isGuest && (isPrivileged || (roomPerms.allow_cam !== false && roomPerms.allow_cam !== 0));
  const canScreenShare = !isGuest && (isPrivileged || (roomPerms.allow_screen !== false && roomPerms.allow_screen !== 0));
  const canChat = !isGuest && (isPrivileged || (roomPerms.allow_chat !== false && roomPerms.allow_chat !== 0));

  const participant = {
    socketId,
    userId: user.id,
    name: user.name,
    isGuest,
    isAdmin: !!user.is_admin,
    username: user.username || null,
    pronouns: user.pronouns || '',
    bio: user.bio || '',
    avatarColor: user.avatar_color || '#8b5cf6',
    avatarUrl: user.avatar_url || null,
    avatarFrame: user.avatar_frame || 'none',
    bannerColor: user.banner_color || '#1e1b4b',
    bannerUrl: user.banner_url || null,
    profileTheme: user.profile_theme || 'default',
    themePrimary: user.theme_primary || '#1e1b4b',
    themeSecondary: user.theme_secondary || '#0f172a',
    statusMode: user.status_mode || 'online',
    statusText: user.status_text || '',
    customEmoji: user.custom_emoji || '',
    role: isGuest ? 'guest' : role,
    isHost: isPrivileged,
    micOn: canAudio ? !!user.initialMicOn : false,
    camOn: canVideo ? !!user.initialCamOn : false,
    deafened: !!user.initialDeafened,
    screenSharing: false,
    handRaised: false,
    canAudio,
    canVideo,
    canScreenShare,
    canChat,
    listening: (onlineUsers.get(user.id)?.statusMode !== 'invisible') ? (onlineUsers.get(user.id)?.listening || null) : null,
    joinedAt: Date.now()
  };
  room.participants.set(socketId, participant);
  return participant;
}

function removeParticipant(roomId, socketId) {
  if (!liveRooms.has(roomId)) return null;
  const room = liveRooms.get(roomId);
  const removed = room.participants.get(socketId);
  room.participants.delete(socketId);

  if (room.pinnedSocketId === socketId) {
    room.pinnedSocketId = null;
  }

  let newHost = null;
  if (removed && removed.isHost && room.participants.size > 0) {
    // Prefer an admin first, otherwise first remaining member
    const list = Array.from(room.participants.values());
    const next = list.find((p) => p.role === 'owner' || p.role === 'admin') || list[0];
    if (next) {
      next.isHost = true;
      newHost = next;
    }
  }

  if (room.participants.size === 0) {
    room.focus.isRunning = false;
    room.focus.endsAt = null;
    room.pinnedSocketId = null;
  }

  return { removed, newHost, remainingCount: room.participants.size };
}

function updateParticipantMedia(roomId, socketId, patch) {
  if (!liveRooms.has(roomId)) return null;
  const room = liveRooms.get(roomId);
  const p = room.participants.get(socketId);
  if (!p) return null;

  if (patch.micOn !== undefined) p.micOn = p.canAudio ? !!patch.micOn : false;
  if (patch.camOn !== undefined) p.camOn = p.canVideo ? !!patch.camOn : false;
  if (patch.deafened !== undefined) p.deafened = !!patch.deafened;
  if (patch.screenSharing !== undefined) p.screenSharing = p.canScreenShare ? !!patch.screenSharing : false;
  if (patch.handRaised !== undefined) p.handRaised = !!patch.handRaised;

  return p;
}

function addChatMessage(roomId, message) {
  const room = getLiveRoom(roomId);
  room.chat.push(message);
  if (room.chat.length > 150) {
    room.chat.shift();
  }
  return message;
}

function getChatHistory(roomId) {
  if (!liveRooms.has(roomId)) return [];
  return liveRooms.get(roomId).chat;
}

// ---- Global Presence Tracking ----

function normalizeStatusMode(mode) {
  if (mode === 'available') return 'online';
  if (mode === 'focusing' || mode === 'dnd') return 'busy';
  if (mode === 'break') return 'away';
  if (['online', 'away', 'busy', 'invisible'].includes(mode)) return mode;
  return 'online';
}

function registerUserSocket(user, socketId) {
  if (!user || !user.id) return;
  let entry = onlineUsers.get(user.id);
  if (!entry) {
    entry = {
      sockets: new Set(),
      statusMode: normalizeStatusMode(user.status_mode),
      statusText: user.status_text || '',
      customEmoji: user.custom_emoji || '',
      currentRoomId: null,
      currentRoomName: null,
      listening: null
    };
    onlineUsers.set(user.id, entry);
  }
  entry.sockets.add(socketId);
  if (user.status_mode) entry.statusMode = normalizeStatusMode(user.status_mode);
  if (user.status_text !== undefined) entry.statusText = user.status_text;
  if (user.custom_emoji !== undefined) entry.customEmoji = user.custom_emoji;
}

function setUserListening(userId, listening = null) {
  const entry = onlineUsers.get(userId);
  if (entry) {
    entry.listening = listening || null;
  }
}

function unregisterUserSocket(userId, socketId) {
  if (!userId || !onlineUsers.has(userId)) return false;
  const entry = onlineUsers.get(userId);
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) {
    onlineUsers.delete(userId);
    dbAsync.run('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), userId]).catch(() => {});
    return true; // went completely offline
  }
  return false;
}

function setUserRoomPresence(userId, roomId, roomName) {
  const entry = onlineUsers.get(userId);
  if (entry) {
    entry.currentRoomId = roomId || null;
    entry.currentRoomName = roomName || null;
  }
}

function getUserPresence(userId, options = {}) {
  const entry = onlineUsers.get(userId);
  if (!entry || entry.sockets.size === 0) {
    return { online: false, statusMode: 'offline', statusText: '', customEmoji: '', currentRoomId: null, currentRoomName: null, listening: null };
  }
  const normalized = normalizeStatusMode(entry.statusMode);
  if (normalized === 'invisible' && !options.includeInvisible) {
    return { online: false, statusMode: 'offline', statusText: '', customEmoji: '', currentRoomId: null, currentRoomName: null, listening: null };
  }
  return {
    online: normalized !== 'invisible',
    statusMode: normalized,
    statusText: entry.statusText || '',
    customEmoji: entry.customEmoji || '',
    currentRoomId: normalized === 'invisible' && !options.includeInvisible ? null : entry.currentRoomId,
    currentRoomName: normalized === 'invisible' && !options.includeInvisible ? null : entry.currentRoomName,
    listening: normalized === 'invisible' && !options.includeInvisible ? null : (entry.listening || null)
  };
}

function getSocketIdsForUser(userId) {
  const entry = onlineUsers.get(userId);
  return entry ? Array.from(entry.sockets) : [];
}

async function pushNotification(io, userId, { type, title, body = '', data = {} }) {
  try {
    const id = crypto.randomUUID();
    const created_at = Date.now();
    await dbAsync.run(
      `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, userId, type, title, body, JSON.stringify(data), created_at]
    );

    const payload = { id, user_id: userId, type, title, body, data, is_read: false, created_at };
    if (io) {
      getSocketIdsForUser(userId).forEach((sid) => {
        io.to(sid).emit('notification', payload);
      });
    }
    return payload;
  } catch (err) {
    console.error('Failed to push notification:', err);
    return null;
  }
}

module.exports = {
  liveRooms,
  onlineUsers,
  getLiveRoom,
  getParticipantCount,
  getLiveParticipants,
  addParticipant,
  removeParticipant,
  updateParticipantMedia,
  addChatMessage,
  getChatHistory,
  registerUserSocket,
  unregisterUserSocket,
  setUserRoomPresence,
  setUserListening,
  getUserPresence,
  getSocketIdsForUser,
  pushNotification
};
