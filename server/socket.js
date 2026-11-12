const crypto = require('crypto');
const { dbAsync } = require('./db');
const { isSuperAdminEmail } = require('./config');
const { fetchYoutubeMetadata } = require('./youtubeMeta');
const {
  addParticipant,
  removeParticipant,
  updateParticipantMedia,
  addChatMessage,
  getLiveRoom,
  getLiveParticipants,
  getChatHistory,
  getParticipantCount,
  registerUserSocket,
  unregisterUserSocket,
  setUserRoomPresence,
  setUserListening,
  onlineUsers,
  liveRooms
} = require('./roomsManager');

function initSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUserId = null;

    // Register global online presence on connect / login
    socket.on('register-presence', async ({ user }) => {
      if (!user || !user.id) return;
      try {
        const dbUser = await dbAsync.get(
          'SELECT id, name, email, is_guest, is_banned, ban_reason FROM users WHERE id = ?',
          [user.id]
        );
        if (!dbUser) return;
        if (dbUser.is_banned) {
          socket.emit('account-banned', {
            reason: dbUser.ban_reason || 'Your account has been permanently banned from StudyHub.'
          });
          return;
        }
      } catch {}

      currentUserId = user.id;
      registerUserSocket(user, socket.id);
      const isInvisible = user.status_mode === 'invisible';
      const entry = onlineUsers.get(user.id);
      io.emit('presence-update', {
        userId: user.id,
        online: !isInvisible,
        statusMode: isInvisible ? 'offline' : (user.status_mode || 'online'),
        statusText: isInvisible ? '' : (user.status_text || ''),
        customEmoji: isInvisible ? '' : (user.custom_emoji || ''),
        listening: isInvisible ? null : (entry?.listening || null)
      });
    });

    // Live Personal YouTube "Listening To" Song/Video Status (Registered accounts only)
    socket.on('listening-update', async ({ url, meta } = {}) => {
      if (!currentUserId) return;
      try {
        const dbUser = await dbAsync.get('SELECT is_guest, is_banned FROM users WHERE id = ?', [currentUserId]);
        if (!dbUser || dbUser.is_guest || dbUser.is_banned) return;
      } catch {
        return;
      }

      let listening = null;
      const cleanUrl = typeof url === 'string' ? url.trim() : '';
      if (cleanUrl) {
        try {
          listening = await fetchYoutubeMetadata(cleanUrl);
        } catch (err) {
          socket.emit('listening-error', { error: err.message || 'Could not detect YouTube metadata' });
          return;
        }
      } else if (meta && meta.videoId && meta.title) {
        listening = { ...meta, updatedAt: Date.now() };
      }

      setUserListening(currentUserId, listening);
      const entry = onlineUsers.get(currentUserId);
      const isInvisible = entry?.statusMode === 'invisible';
      const publicListening = isInvisible ? null : listening;

      for (const [rId, rState] of liveRooms.entries()) {
        let changed = false;
        for (const p of rState.participants.values()) {
          if (p.userId === currentUserId) {
            p.listening = publicListening;
            changed = true;
          }
        }
        if (changed) {
          io.to(rId).emit('user-listening-updated', { userId: currentUserId, listening: publicListening });
        }
      }

      if (!isInvisible) {
        io.emit('presence-update', { userId: currentUserId, listening: publicListening });
      }
      socket.emit('listening-ack', { listening });
    });

    // Join room (with global ban check, room ban check, verified DB role/guest lookup, governance perms)
    socket.on('join-room', async ({ roomId, user, initialMedia }) => {
      if (!roomId || !user || !user.id) return;

      let dbUser = null;
      try {
        dbUser = await dbAsync.get(
          'SELECT id, name, email, is_guest, is_banned, ban_reason, chat_muted_until FROM users WHERE id = ?',
          [user.id]
        );
        if (!dbUser) {
          socket.emit('kicked-from-room', { roomId, reason: 'User session invalid.' });
          return;
        }
        if (dbUser.is_banned) {
          socket.emit('account-banned', {
            reason: dbUser.ban_reason || 'Your account has been permanently banned from StudyHub.'
          });
          socket.emit('kicked-from-room', { roomId, reason: 'Account permanently banned.' });
          return;
        }
      } catch {}

      const verifiedIsGuest = dbUser ? !!dbUser.is_guest : !!user.is_guest;
      const verifiedIsAdmin = !verifiedIsGuest && isSuperAdminEmail(dbUser?.email || user.email);

      currentUserId = user.id;
      registerUserSocket({ ...user, is_guest: verifiedIsGuest }, socket.id);

      // Check room ban list
      try {
        const ban = await dbAsync.get('SELECT user_id FROM room_bans WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
        if (ban) {
          socket.emit('kicked-from-room', { roomId, reason: 'You are banned from this room.' });
          return;
        }
      } catch {}

      // Determine user's role & room governance permissions
      let role = 'member';
      let roomTitle = 'Study Room';
      let roomPerms = {
        allow_mic: true,
        allow_cam: true,
        allow_screen: true,
        allow_chat: true,
        allow_media_control: true
      };
      try {
        const roomRow = await dbAsync.get(
          `SELECT name, host_id, youtube_url, allow_mic, allow_cam, allow_screen, allow_chat, allow_media_control
           FROM rooms WHERE id = ?`,
          [roomId]
        );
        if (roomRow) {
          roomTitle = roomRow.name;
          roomPerms = {
            allow_mic: roomRow.allow_mic !== 0,
            allow_cam: roomRow.allow_cam !== 0,
            allow_screen: roomRow.allow_screen !== 0,
            allow_chat: roomRow.allow_chat !== 0,
            allow_media_control: roomRow.allow_media_control !== 0
          };
          if (!verifiedIsGuest) {
            if (roomRow.host_id === user.id) {
              role = 'owner';
            } else {
              const roleRow = await dbAsync.get('SELECT role FROM room_roles WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
              if (roleRow) role = roleRow.role;
            }
          }
          const liveRoom = getLiveRoom(roomId);
          if (!liveRoom.youtube.url && roomRow.youtube_url) {
            liveRoom.youtube.url = roomRow.youtube_url;
          }
        }
      } catch {}

      // Persist membership so joined rooms stay in user's dashboard (registered accounts & visiting guests)
      if (user.id) {
        const now = Date.now();
        dbAsync.run(
          `INSERT INTO room_memberships (user_id, room_id, joined_at, last_joined_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, room_id) DO UPDATE SET last_joined_at = excluded.last_joined_at`,
          [user.id, roomId, now, now]
        ).catch(() => {});
      }

      currentRoomId = roomId;
      socket.join(roomId);

      const userWithMedia = {
        ...user,
        is_guest: verifiedIsGuest,
        is_admin: verifiedIsAdmin,
        initialMicOn: !!initialMedia?.micOn,
        initialCamOn: verifiedIsGuest ? false : !!initialMedia?.camOn,
        initialDeafened: !!initialMedia?.deafened
      };

      const participant = addParticipant(roomId, socket.id, userWithMedia, role, roomPerms);
      const room = getLiveRoom(roomId);

      setUserRoomPresence(user.id, roomId, roomTitle);
      if (user.status_mode !== 'invisible') {
        io.emit('presence-update', {
          userId: user.id,
          online: true,
          currentRoomId: roomId,
          currentRoomName: roomTitle
        });
      }

      // System message
      const joinMsg = {
        id: crypto.randomUUID(),
        system: true,
        text: `${user.name} joined the room`,
        ts: Date.now()
      };
      addChatMessage(roomId, joinMsg);

      // Send initial room state to newly joined client
      socket.emit('room-state', {
        roomId,
        participants: getLiveParticipants(roomId),
        chat: getChatHistory(roomId),
        focus: room.focus,
        pinnedSocketId: room.pinnedSocketId,
        youtube: room.youtube,
        goals: room.goals || [],
        strokes: room.strokes || [],
        permissions: roomPerms,
        isHost: participant.isHost,
        myParticipantInfo: participant
      });

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        participant,
        socketId: socket.id
      });
      socket.to(roomId).emit('chat-message', joinMsg);
      io.to(roomId).emit('room-members-updated');

      io.emit('room-count-update', {
        roomId,
        count: getParticipantCount(roomId)
      });
    });

    // Live profile sync inside active room
    socket.on('profile-sync', ({ roomId, user }) => {
      if (!roomId || !user) return;
      const room = getLiveRoom(roomId);
      const p = room.participants.get(socket.id);
      if (p) {
        p.name = user.name;
        p.avatarColor = user.avatar_color || p.avatarColor;
        p.avatarUrl = user.avatar_url !== undefined ? user.avatar_url : p.avatarUrl;
        p.avatarFrame = user.avatar_frame !== undefined ? user.avatar_frame : p.avatarFrame;
        p.profileTheme = user.profile_theme !== undefined ? user.profile_theme : p.profileTheme;
        p.themePrimary = user.theme_primary !== undefined ? user.theme_primary : p.themePrimary;
        p.themeSecondary = user.theme_secondary !== undefined ? user.theme_secondary : p.themeSecondary;
        p.statusMode = user.status_mode || p.statusMode;
        p.statusText = user.status_text !== undefined ? user.status_text : p.statusText;
        p.customEmoji = user.custom_emoji !== undefined ? user.custom_emoji : p.customEmoji;
        p.bio = user.bio !== undefined ? user.bio : p.bio;
        p.pronouns = user.pronouns !== undefined ? user.pronouns : p.pronouns;
        io.to(roomId).emit('participants-sync', getLiveParticipants(roomId));
      }
    });

    // WebRTC Signaling Relay
    socket.on('signal', ({ to, signal }) => {
      if (!to || !signal) return;
      io.to(to).emit('signal', {
        from: socket.id,
        signal
      });
    });

    // Mic / Camera / Deafen / Screen share / Hand raise state toggles
    socket.on('media-toggle', ({ roomId, micOn, camOn, deafened, screenSharing, handRaised }) => {
      const room = getLiveRoom(roomId);
      const current = room.participants.get(socket.id);
      if (!current) return;

      const safeMicOn = micOn !== undefined ? (current.canAudio ? !!micOn : false) : undefined;
      const safeCamOn = camOn !== undefined ? (current.canVideo ? !!camOn : false) : undefined;
      const safeScreen = screenSharing !== undefined ? (current.canScreenShare ? !!screenSharing : false) : undefined;

      const updated = updateParticipantMedia(roomId, socket.id, {
        micOn: safeMicOn,
        camOn: safeCamOn,
        deafened,
        screenSharing: safeScreen,
        handRaised
      });
      if (updated) {
        io.to(roomId).emit('user-media-updated', {
          socketId: socket.id,
          micOn: updated.micOn,
          camOn: updated.camOn,
          deafened: updated.deafened,
          screenSharing: updated.screenSharing,
          handRaised: updated.handRaised,
          canAudio: updated.canAudio,
          canVideo: updated.canVideo,
          canScreenShare: updated.canScreenShare
        });
      }
    });

    // Room Chat message (enforces guest restrictions, admin chat timeouts, and room allow_chat)
    socket.on('chat-message', async ({ roomId, text, replyTo }) => {
      if (!roomId || !text || !text.trim()) return;

      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender) return;

      if (sender.isGuest) {
        socket.emit('moderation-notice', {
          message: 'Guest accounts cannot send chat messages. Sign up for a free account to participate.',
          field: 'chat',
          allowed: false
        });
        return;
      }

      try {
        const u = await dbAsync.get('SELECT is_banned, chat_muted_until FROM users WHERE id = ?', [sender.userId]);
        if (u?.is_banned) return;
        if (u?.chat_muted_until && u.chat_muted_until > Date.now()) {
          socket.emit('moderation-notice', {
            message: 'Your chat privileges are temporarily timed out by a platform administrator.',
            field: 'chat',
            allowed: false
          });
          return;
        }
      } catch {}

      if (sender.role !== 'owner' && sender.role !== 'admin') {
        try {
          const r = await dbAsync.get('SELECT allow_chat FROM rooms WHERE id = ?', [roomId]);
          if (r && r.allow_chat === 0) {
            socket.emit('moderation-notice', {
              message: 'Room chat is currently restricted to hosts and admins.',
              field: 'chat',
              allowed: false
            });
            return;
          }
        } catch {}
      }

      const message = {
        id: crypto.randomUUID(),
        senderId: sender.userId,
        senderName: sender.name,
        avatarColor: sender.avatarColor,
        avatarUrl: sender.avatarUrl,
        avatarFrame: sender.avatarFrame,
        role: sender.role,
        text: text.trim().slice(0, 800),
        replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text.slice(0, 120) } : null,
        ts: Date.now(),
        system: false
      };

      addChatMessage(roomId, message);
      io.to(roomId).emit('chat-message', message);
    });

    // Floating Emoji Reactions
    socket.on('reaction', ({ roomId, emoji }) => {
      if (!roomId || !emoji) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender) return;

      io.to(roomId).emit('reaction', {
        id: crypto.randomUUID(),
        emoji: String(emoji).slice(0, 8),
        senderName: sender.name,
        socketId: socket.id
      });
    });

    // Soundboard clip broadcast (registered accounts only — anti-spam)
    socket.on('soundboard-play', ({ roomId, soundId }) => {
      if (!roomId || !soundId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || sender.isGuest) return;

      io.to(roomId).emit('soundboard-play', {
        soundId,
        senderName: sender.name
      });
    });

    // Pin / Unpin for everyone (Owner or Admin)
    socket.on('pin-for-everyone', ({ roomId, targetSocketId }) => {
      const room = getLiveRoom(roomId);
      const actor = room.participants.get(socket.id);
      if (!actor || (!actor.isHost && actor.role !== 'owner' && actor.role !== 'admin')) return;

      room.pinnedSocketId = targetSocketId || null;
      io.to(roomId).emit('pinned-updated', { pinnedSocketId: room.pinnedSocketId, byName: actor.name });
    });

    // Host / Admin Moderation Actions (kick, disable/allow audio/video/screen)
    socket.on('moderate-participant', ({ roomId, targetSocketId, action }) => {
      const room = getLiveRoom(roomId);
      const actor = room.participants.get(socket.id);
      const target = room.participants.get(targetSocketId);
      if (!actor || !target) return;
      if (!actor.isHost && actor.role !== 'owner' && actor.role !== 'admin') return;
      if (target.role === 'owner' && actor.role !== 'owner') return;

      switch (action) {
        case 'kick':
          io.to(targetSocketId).emit('kicked-from-room', { roomId, reason: `Removed by ${actor.name}` });
          break;
        case 'disable-audio':
          target.canAudio = false;
          target.micOn = false;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} disabled your microphone`, field: 'audio', allowed: false });
          break;
        case 'allow-audio':
          target.canAudio = true;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} allowed your microphone`, field: 'audio', allowed: true });
          break;
        case 'disable-video':
          target.canVideo = false;
          target.camOn = false;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} disabled your video`, field: 'video', allowed: false });
          break;
        case 'allow-video':
          target.canVideo = true;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} allowed your video`, field: 'video', allowed: true });
          break;
        case 'disable-screen':
          target.canScreenShare = false;
          target.screenSharing = false;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} disabled your screen sharing`, field: 'screen', allowed: false });
          break;
        case 'allow-screen':
          target.canScreenShare = true;
          io.to(targetSocketId).emit('moderation-notice', { message: `${actor.name} allowed screen sharing`, field: 'screen', allowed: true });
          break;
        default:
          return;
      }

      io.to(roomId).emit('user-media-updated', {
        socketId: targetSocketId,
        micOn: target.micOn,
        camOn: target.camOn,
        deafened: target.deafened,
        screenSharing: target.screenSharing,
        handRaised: target.handRaised,
        canAudio: target.canAudio,
        canVideo: target.canVideo,
        canScreenShare: target.canScreenShare
      });
    });

    // Host / Admin Mass Moderation Actions (mute-all, stop-all-videos)
    socket.on('moderate-all', ({ roomId, action }) => {
      const room = getLiveRoom(roomId);
      const actor = room.participants.get(socket.id);
      if (!actor || (!actor.isHost && actor.role !== 'owner' && actor.role !== 'admin')) return;

      for (const [sid, p] of room.participants.entries()) {
        if (sid === socket.id) continue;
        if (action === 'mute-all') {
          p.micOn = false;
          io.to(sid).emit('moderation-notice', { message: `${actor.name} muted all participants`, field: 'mute-all' });
        } else if (action === 'stop-all-videos') {
          p.camOn = false;
          io.to(sid).emit('moderation-notice', { message: `${actor.name} turned off participant videos`, field: 'stop-videos-all' });
        }
      }
      io.to(roomId).emit('participants-sync', getLiveParticipants(roomId));
    });

    // Synchronized YouTube Watch-Together
    socket.on('youtube-sync', async ({ roomId, url, isPlaying }) => {
      if (!roomId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender) return;

      if (sender.role !== 'owner' && sender.role !== 'admin') {
        try {
          const r = await dbAsync.get('SELECT allow_media_control FROM rooms WHERE id = ?', [roomId]);
          if (r && r.allow_media_control === 0) {
            socket.emit('moderation-notice', {
              message: 'YouTube Watch-Together controls are restricted to hosts and admins.',
              field: 'media',
              allowed: false
            });
            return;
          }
        } catch {}
      }

      if (url !== undefined) {
        room.youtube.url = url;
        room.youtube.meta = url ? await fetchYoutubeMetadata(url).catch(() => null) : null;
        dbAsync.run('UPDATE rooms SET youtube_url = ? WHERE id = ?', [url || null, roomId]).catch(() => {});
      }
      if (isPlaying !== undefined) {
        room.youtube.isPlaying = !!isPlaying;
      }
      room.youtube.updatedAt = Date.now();

      io.to(roomId).emit('youtube-sync', {
        ...room.youtube,
        byName: sender.name
      });
    });

    // Shared Session Study Goals (Registered accounts only)
    socket.on('room-goal-add', ({ roomId, text }) => {
      if (!roomId || !text || !text.trim()) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || sender.isGuest) return;

      const goal = {
        id: crypto.randomUUID(),
        userId: sender.userId,
        userName: sender.name,
        avatarColor: sender.avatarColor,
        text: text.trim().slice(0, 120),
        completed: false,
        createdAt: Date.now()
      };
      room.goals = [...(room.goals || []).slice(-39), goal];
      io.to(roomId).emit('room-goals-updated', room.goals);
    });

    socket.on('room-goal-toggle', ({ roomId, goalId }) => {
      if (!roomId || !goalId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender) return;

      room.goals = (room.goals || []).map((g) => {
        if (g.id !== goalId) return g;
        if (g.userId !== sender.userId && sender.role !== 'owner' && sender.role !== 'admin') return g;
        return { ...g, completed: !g.completed };
      });
      io.to(roomId).emit('room-goals-updated', room.goals);
    });

    socket.on('room-goal-delete', ({ roomId, goalId }) => {
      if (!roomId || !goalId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender) return;

      room.goals = (room.goals || []).filter((g) => {
        if (g.id !== goalId) return true;
        return g.userId !== sender.userId && sender.role !== 'owner' && sender.role !== 'admin';
      });
      io.to(roomId).emit('room-goals-updated', room.goals);
    });

    // Collaborative Whiteboard Sync (Registered accounts only — guests view read-only)
    socket.on('whiteboard-stroke', ({ roomId, stroke }) => {
      if (!roomId || !stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || sender.isGuest) return;

      const cleanStroke = {
        id: stroke.id || crypto.randomUUID(),
        points: stroke.points.slice(0, 300),
        color: String(stroke.color || '#a78bfa').slice(0, 24),
        width: Math.min(Math.max(Number(stroke.width) || 3, 1), 24),
        tool: stroke.tool === 'eraser' ? 'eraser' : 'pen',
        userId: sender.userId,
        userName: sender.name
      };
      room.strokes = [...(room.strokes || []).slice(-499), cleanStroke];
      socket.to(roomId).emit('whiteboard-stroke', cleanStroke);
    });

    socket.on('whiteboard-undo', ({ roomId }) => {
      if (!roomId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || sender.isGuest || !room.strokes?.length) return;

      // Remove latest stroke created by sender (or any stroke if owner/admin)
      for (let i = room.strokes.length - 1; i >= 0; i--) {
        if (room.strokes[i].userId === sender.userId || sender.role === 'owner' || sender.role === 'admin') {
          room.strokes.splice(i, 1);
          break;
        }
      }
      io.to(roomId).emit('whiteboard-sync', room.strokes);
    });

    socket.on('whiteboard-clear', ({ roomId }) => {
      if (!roomId) return;
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || sender.isGuest) return;
      room.strokes = [];
      io.to(roomId).emit('whiteboard-clear', { byName: sender.name });
    });

    // Synchronized Focus Session - Start (Host/Admin only)
    socket.on('focus-start', ({ roomId, minutes }) => {
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || (!sender.isHost && sender.role !== 'owner' && sender.role !== 'admin')) return;

      const mins = Math.min(Math.max(parseInt(minutes) || 25, 1), 180);
      const endsAt = Date.now() + mins * 60 * 1000;

      room.focus = {
        isRunning: true,
        endsAt,
        minutes: mins
      };

      const focusMsg = {
        id: crypto.randomUUID(),
        system: true,
        text: `Focus session started for ${mins} minutes by ${sender.name}`,
        ts: Date.now()
      };
      addChatMessage(roomId, focusMsg);

      io.to(roomId).emit('focus-update', room.focus);
      io.to(roomId).emit('chat-message', focusMsg);
    });

    // Synchronized Focus Session - Stop
    socket.on('focus-stop', ({ roomId }) => {
      const room = getLiveRoom(roomId);
      const sender = room.participants.get(socket.id);
      if (!sender || (!sender.isHost && sender.role !== 'owner' && sender.role !== 'admin')) return;

      room.focus = {
        isRunning: false,
        endsAt: null,
        minutes: room.focus.minutes || 25
      };

      const stopMsg = {
        id: crypto.randomUUID(),
        system: true,
        text: `Focus session stopped by ${sender.name}`,
        ts: Date.now()
      };
      addChatMessage(roomId, stopMsg);

      io.to(roomId).emit('focus-update', room.focus);
      io.to(roomId).emit('chat-message', stopMsg);
    });

    // Leave Room Helper
    function handleLeaveRoom() {
      if (!currentRoomId) return;
      const roomId = currentRoomId;
      currentRoomId = null;

      if (currentUserId) {
        setUserRoomPresence(currentUserId, null, null);
        const entry = onlineUsers.get(currentUserId);
        if (!entry || entry.statusMode !== 'invisible') {
          io.emit('presence-update', {
            userId: currentUserId,
            online: true,
            currentRoomId: null,
            currentRoomName: null
          });
        }
      }

      const result = removeParticipant(roomId, socket.id);
      if (result && result.removed) {
        socket.leave(roomId);

        const leaveMsg = {
          id: crypto.randomUUID(),
          system: true,
          text: `${result.removed.name} left the room`,
          ts: Date.now()
        };
        addChatMessage(roomId, leaveMsg);

        io.to(roomId).emit('user-left', {
          socketId: socket.id,
          userId: result.removed.userId,
          newHost: result.newHost
        });
        io.to(roomId).emit('chat-message', leaveMsg);
        io.to(roomId).emit('room-members-updated');

        io.emit('room-count-update', {
          roomId,
          count: result.remainingCount
        });
      }
    }

    socket.on('leave-room', handleLeaveRoom);

    socket.on('disconnect', () => {
      handleLeaveRoom();
      if (currentUserId) {
        const wentOffline = unregisterUserSocket(currentUserId, socket.id);
        if (wentOffline) {
          io.emit('presence-update', {
            userId: currentUserId,
            online: false,
            statusMode: 'offline',
            currentRoomId: null,
            currentRoomName: null
          });
        }
      }
    });
  });
}

module.exports = { initSocketHandlers };
