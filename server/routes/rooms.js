const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware, optionalAuthMiddleware, requireRegisteredUser, hashPassword, comparePassword } = require('../auth');
const { cleanupLiveRoom, deleteRoomCompletely } = require('../userCleanup');
const {
  getParticipantCount,
  getLiveParticipants,
  getLiveRoom,
  getUserPresence,
  getSocketIdsForUser,
  setUserRoomPresence,
  pushNotification
} = require('../roomsManager');

const ROOM_COLS = `
  id, name, description, category, visibility, capacity, host_id, cover_url, vibe, mode, theme, theme_accent,
  is_locked, waiting_room, allow_mic, allow_cam, allow_screen, allow_chat, allow_media_control,
  youtube_url, created_at
`;
const VALID_ROOM_THEMES = [
  'default',
  'lofi-purple',
  'forest-calm',
  'ocean-deep',
  'sunset-warm',
  'crimson-focus',
  'aurora-nord',
  'minimal-slate'
];

function sanitizeHexAccent(val) {
  if (!val || typeof val !== 'string') return '';
  const clean = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean.toLowerCase() : '';
}

function formatRoomRow(r) {
  if (!r) return null;
  return {
    ...r,
    theme: VALID_ROOM_THEMES.includes(r.theme) ? r.theme : 'default',
    theme_accent: sanitizeHexAccent(r.theme_accent),
    is_locked: !!r.is_locked,
    waiting_room: !!r.waiting_room,
    allow_mic: r.allow_mic !== 0,
    allow_cam: r.allow_cam !== 0,
    allow_screen: r.allow_screen !== 0,
    allow_chat: r.allow_chat !== 0,
    allow_media_control: r.allow_media_control !== 0,
    isPrivate: r.visibility === 'private' || !!r.is_locked
  };
}

async function findRoomByIdOrPrefix(idOrPrefix) {
  let room = await dbAsync.get(`SELECT ${ROOM_COLS} FROM rooms WHERE id = ?`, [idOrPrefix]);
  if (!room && idOrPrefix && idOrPrefix.length >= 8) {
    const matches = await dbAsync.all(
      `SELECT ${ROOM_COLS} FROM rooms WHERE id LIKE ? LIMIT 2`,
      [`${idOrPrefix}%`]
    );
    if (matches.length === 1) room = matches[0];
  }
  return room;
}

async function getUserRoomRole(roomId, userId) {
  const room = await dbAsync.get('SELECT host_id FROM rooms WHERE id = ?', [roomId]);
  if (!room) return null;
  if (room.host_id === userId) return 'owner';
  const roleRow = await dbAsync.get('SELECT role FROM room_roles WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return roleRow ? roleRow.role : 'member';
}

// List ONLY rooms the current user created or previously joined
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ rooms: [], favourites: [] });
    }

    const rooms = await dbAsync.all(
      `SELECT DISTINCT r.id, r.name, r.description, r.category, r.visibility, r.capacity, r.host_id,
              r.cover_url, r.vibe, r.mode, r.theme, r.theme_accent, r.is_locked, r.waiting_room,
              r.allow_mic, r.allow_cam, r.allow_screen, r.allow_chat, r.allow_media_control,
              r.youtube_url, r.created_at,
              COALESCE(rm.last_joined_at, r.created_at) AS sort_ts
       FROM rooms r
       LEFT JOIN room_memberships rm ON rm.room_id = r.id AND rm.user_id = ?
       WHERE (r.host_id = ? OR rm.user_id = ?)
         AND NOT EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = r.id AND rb.user_id = ?)
       ORDER BY sort_ts DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );

    const enriched = rooms.map((r) => ({
      ...formatRoomRow(r),
      liveParticipantsCount: getParticipantCount(r.id)
    }));

    const favRows = await dbAsync.all('SELECT room_id FROM favourite_rooms WHERE user_id = ?', [req.user.id]);
    const favourites = favRows.map((f) => f.room_id);

    res.json({ rooms: enriched, favourites });
  } catch (err) {
    console.error('List rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Get user's favourite room IDs
router.get('/favourites', authMiddleware, async (req, res) => {
  try {
    const favs = await dbAsync.all('SELECT room_id FROM favourite_rooms WHERE user_id = ?', [req.user.id]);
    res.json({ favourites: favs.map((f) => f.room_id) });
  } catch (err) {
    console.error('Fetch favourites error:', err);
    res.status(500).json({ error: 'Failed to fetch favourites' });
  }
});

// Toggle favourite
router.post('/:id/favourite', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbAsync.get(
      'SELECT room_id FROM favourite_rooms WHERE user_id = ? AND room_id = ?',
      [req.user.id, id]
    );

    if (existing) {
      await dbAsync.run('DELETE FROM favourite_rooms WHERE user_id = ? AND room_id = ?', [req.user.id, id]);
      res.json({ isFavourite: false });
    } else {
      await dbAsync.run('INSERT INTO favourite_rooms (user_id, room_id) VALUES (?, ?)', [req.user.id, id]);
      res.json({ isFavourite: true });
    }
  } catch (err) {
    console.error('Toggle favourite error:', err);
    res.status(500).json({ error: 'Failed to toggle favourite' });
  }
});

// Get specific room details
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const room = await findRoomByIdOrPrefix(req.params.id.trim());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const liveParticipants = getLiveParticipants(room.id);
    const liveState = getLiveRoom(room.id);

    res.json({
      room: {
        ...formatRoomRow(room),
        liveParticipantsCount: liveParticipants.length,
        liveParticipants,
        focus: liveState.focus,
        youtube: liveState.youtube,
        pinnedSocketId: liveState.pinnedSocketId
      }
    });
  } catch (err) {
    console.error('Fetch room error:', err);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Create Room (Registered accounts only — guests restricted from creating rooms)
router.post('/', authMiddleware, requireRegisteredUser, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      visibility,
      password,
      capacity,
      cover_url,
      vibe,
      mode,
      theme,
      theme_accent,
      waiting_room,
      allow_mic,
      allow_cam,
      allow_screen,
      allow_chat,
      allow_media_control
    } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const id = crypto.randomUUID();
    const isPrivate = visibility === 'private';
    let password_hash = null;
    if (isPrivate && password) {
      password_hash = await hashPassword(password);
    }

    const parsedCapacity = Math.min(Math.max(parseInt(capacity) || 10, 2), 50);
    const cleanTheme = VALID_ROOM_THEMES.includes(theme) ? theme : 'default';
    const cleanThemeAccent = sanitizeHexAccent(theme_accent);
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO rooms (
         id, name, description, category, visibility, password_hash, capacity, host_id,
         cover_url, vibe, mode, theme, theme_accent, is_locked, waiting_room,
         allow_mic, allow_cam, allow_screen, allow_chat, allow_media_control,
         is_seed, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        name.trim().slice(0, 60),
        (description || '').trim().slice(0, 200),
        category || vibe || 'Study',
        isPrivate ? 'private' : 'public',
        password_hash,
        parsedCapacity,
        req.user.id,
        cover_url || null,
        vibe || 'Study',
        mode || 'Group',
        cleanTheme,
        cleanThemeAccent,
        isPrivate ? 1 : 0,
        waiting_room ? 1 : 0,
        allow_mic === false ? 0 : 1,
        allow_cam === false ? 0 : 1,
        allow_screen === false ? 0 : 1,
        allow_chat === false ? 0 : 1,
        allow_media_control === false ? 0 : 1,
        now
      ]
    );

    await dbAsync.run(
      `INSERT INTO room_memberships (user_id, room_id, joined_at, last_joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, room_id) DO UPDATE SET last_joined_at = excluded.last_joined_at`,
      [req.user.id, id, now, now]
    );

    await dbAsync.run(
      `INSERT INTO room_roles (room_id, user_id, role) VALUES (?, ?, 'owner')
       ON CONFLICT(room_id, user_id) DO UPDATE SET role = 'owner'`,
      [id, req.user.id]
    );

    const created = await dbAsync.get(`SELECT ${ROOM_COLS} FROM rooms WHERE id = ?`, [id]);

    res.status(201).json({
      room: { ...formatRoomRow(created), liveParticipantsCount: 0 }
    });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Update Room Settings (Owner / Admin only - matches Room Settings Drawer)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRoomRole(id, req.user.id);
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'Only room owner or admins can update room settings' });
    }

    const {
      name,
      description,
      cover_url,
      vibe,
      mode,
      theme,
      theme_accent,
      is_locked,
      waiting_room,
      allow_mic,
      allow_cam,
      allow_screen,
      allow_chat,
      allow_media_control,
      password,
      capacity,
      youtube_url
    } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim().slice(0, 60));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(String(description).trim().slice(0, 200));
    }
    if (cover_url !== undefined) {
      updates.push('cover_url = ?');
      params.push(cover_url || null);
    }
    if (vibe !== undefined && ['Chill', 'Study', 'Work'].includes(vibe)) {
      updates.push('vibe = ?');
      params.push(vibe);
      updates.push('category = ?');
      params.push(vibe);
    }
    if (mode !== undefined && ['Group', 'Stream', 'Focus'].includes(mode)) {
      updates.push('mode = ?');
      params.push(mode);
    }
    if (theme !== undefined && VALID_ROOM_THEMES.includes(theme)) {
      updates.push('theme = ?');
      params.push(theme);
    }
    if (theme_accent !== undefined) {
      updates.push('theme_accent = ?');
      params.push(sanitizeHexAccent(theme_accent));
    }
    if (is_locked !== undefined) {
      const locked = !!is_locked;
      updates.push('is_locked = ?');
      params.push(locked ? 1 : 0);
      updates.push('visibility = ?');
      params.push(locked ? 'private' : 'public');
    }
    if (waiting_room !== undefined) {
      updates.push('waiting_room = ?');
      params.push(waiting_room ? 1 : 0);
    }
    if (allow_mic !== undefined) {
      updates.push('allow_mic = ?');
      params.push(allow_mic ? 1 : 0);
    }
    if (allow_cam !== undefined) {
      updates.push('allow_cam = ?');
      params.push(allow_cam ? 1 : 0);
    }
    if (allow_screen !== undefined) {
      updates.push('allow_screen = ?');
      params.push(allow_screen ? 1 : 0);
    }
    if (allow_chat !== undefined) {
      updates.push('allow_chat = ?');
      params.push(allow_chat ? 1 : 0);
    }
    if (allow_media_control !== undefined) {
      updates.push('allow_media_control = ?');
      params.push(allow_media_control ? 1 : 0);
    }
    if (password !== undefined && password !== '') {
      const password_hash = await hashPassword(password);
      updates.push('password_hash = ?');
      params.push(password_hash);
    } else if (is_locked === false) {
      updates.push('password_hash = NULL');
    }
    if (capacity !== undefined) {
      updates.push('capacity = ?');
      params.push(Math.min(Math.max(parseInt(capacity) || 10, 2), 50));
    }
    if (youtube_url !== undefined) {
      updates.push('youtube_url = ?');
      params.push(youtube_url || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No room settings provided' });
    }

    params.push(id);
    await dbAsync.run(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await dbAsync.get(`SELECT ${ROOM_COLS} FROM rooms WHERE id = ?`, [id]);
    const enriched = formatRoomRow(updated);

    // Sync governance permissions onto live non-privileged participants
    const liveRoom = getLiveRoom(id);
    let permsChanged = false;
    for (const p of liveRoom.participants.values()) {
      if (p.role !== 'owner' && p.role !== 'admin') {
        if (allow_mic !== undefined) {
          p.canAudio = enriched.allow_mic;
          if (!p.canAudio) p.micOn = false;
          permsChanged = true;
        }
        if (allow_cam !== undefined) {
          p.canVideo = enriched.allow_cam;
          if (!p.canVideo) p.camOn = false;
          permsChanged = true;
        }
        if (allow_screen !== undefined) {
          p.canScreenShare = enriched.allow_screen;
          if (!p.canScreenShare) p.screenSharing = false;
          permsChanged = true;
        }
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('room-settings-updated', enriched);
      io.to(id).emit('room-permissions-updated', {
        allow_mic: enriched.allow_mic,
        allow_cam: enriched.allow_cam,
        allow_screen: enriched.allow_screen,
        allow_chat: enriched.allow_chat,
        allow_media_control: enriched.allow_media_control,
        waiting_room: enriched.waiting_room,
        byName: req.user.name
      });
      if (permsChanged) {
        io.to(id).emit('participants-sync', getLiveParticipants(id));
      }
    }

    res.json({ room: enriched });
  } catch (err) {
    console.error('Update room settings error:', err);
    res.status(500).json({ error: 'Failed to update room settings' });
  }
});

// Join Room
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const room = await findRoomByIdOrPrefix(req.params.id.trim());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if banned
    const ban = await dbAsync.get('SELECT user_id FROM room_bans WHERE room_id = ? AND user_id = ?', [room.id, req.user.id]);
    if (ban) {
      return res.status(403).json({ error: 'You are banned from this room' });
    }

    const fullRoom = await dbAsync.get('SELECT password_hash, visibility, is_locked, waiting_room, host_id FROM rooms WHERE id = ?', [room.id]);
    const role = await getUserRoomRole(room.id, req.user.id);
    const isPrivileged = role === 'owner' || role === 'admin';

    if (!isPrivileged && (fullRoom.visibility === 'private' || fullRoom.is_locked)) {
      if (fullRoom.password_hash) {
        const { password } = req.body;
        const match = await comparePassword(password || '', fullRoom.password_hash);
        if (!match) {
          return res.status(401).json({ error: 'Incorrect room password' });
        }
      } else {
        // Locked without password: check if approved join request exists
        const approved = await dbAsync.get(
          "SELECT id FROM room_join_requests WHERE room_id = ? AND user_id = ? AND status = 'approved'",
          [room.id, req.user.id]
        );
        if (!approved) {
          return res.status(403).json({ error: 'This room is locked. Request permission from the host to join.', needsApproval: true, roomId: room.id });
        }
      }
    }

    if (!isPrivileged && fullRoom.waiting_room) {
      const approved = await dbAsync.get(
        "SELECT id FROM room_join_requests WHERE room_id = ? AND user_id = ? AND status = 'approved'",
        [room.id, req.user.id]
      );
      if (!approved) {
        return res.status(403).json({
          error: 'Waiting Room is enabled. Ask the room host or an admin to admit you.',
          needsApproval: true,
          waitingRoom: true,
          roomId: room.id
        });
      }
    }

    const now = Date.now();
    await dbAsync.run(
      `INSERT INTO room_memberships (user_id, room_id, joined_at, last_joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, room_id) DO UPDATE SET last_joined_at = excluded.last_joined_at`,
      [req.user.id, room.id, now, now]
    );

    res.json({ room: formatRoomRow(room) });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Knock / Request to Join Locked or Waiting Room
router.post('/:id/knock', authMiddleware, async (req, res) => {
  try {
    const room = await findRoomByIdOrPrefix(req.params.id.trim());
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const id = crypto.randomUUID();
    const now = Date.now();
    await dbAsync.run(
      `INSERT INTO room_join_requests (id, room_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET status = 'pending', created_at = excluded.created_at`,
      [id, room.id, req.user.id, now]
    );

    const io = req.app.get('io');
    const adminRows = await dbAsync.all("SELECT user_id FROM room_roles WHERE room_id = ? AND role = 'admin'", [room.id]);
    const notifyTargets = new Set([room.host_id, ...adminRows.map((a) => a.user_id)].filter(Boolean));

    for (const targetId of notifyTargets) {
      if (targetId === req.user.id) continue;
      await pushNotification(io, targetId, {
        type: 'room_knock',
        title: `${req.user.name} wants to join "${room.name}"`,
        body: 'Waiting room knock — open the Member panel to admit or decline.',
        data: { roomId: room.id, requesterId: req.user.id, requesterName: req.user.name }
      });
    }
    if (io) io.to(room.id).emit('room-members-updated');

    res.json({ success: true, message: 'Join request sent to the room host and admins' });
  } catch (err) {
    console.error('Knock error:', err);
    res.status(500).json({ error: 'Failed to send join request' });
  }
});

// Respond to Join Request (Host/Admin)
router.post('/:id/knock/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const { action } = req.body; // 'approve' | 'decline'
    const role = await getUserRoomRole(id, req.user.id);
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'Only host or admin can approve requests' });
    }

    const room = await dbAsync.get('SELECT name FROM rooms WHERE id = ?', [id]);
    const io = req.app.get('io');

    if (action === 'approve') {
      await dbAsync.run(
        "UPDATE room_join_requests SET status = 'approved' WHERE room_id = ? AND user_id = ?",
        [id, targetUserId]
      );
      await pushNotification(io, targetUserId, {
        type: 'room_invite',
        title: `You were admitted to "${room?.name || 'Study Room'}"`,
        body: 'Click to join the room now!',
        data: { roomId: id }
      });
    } else {
      await dbAsync.run('DELETE FROM room_join_requests WHERE room_id = ? AND user_id = ?', [id, targetUserId]);
    }

    if (io) io.to(id).emit('room-members-updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

// Get Members, Roles, Bans, Pending Requests (for MEMBER sidebar tab)
router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const room = await dbAsync.get('SELECT host_id FROM rooms WHERE id = ?', [id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const callerRole = await getUserRoomRole(id, req.user.id);
    const isPrivileged = callerRole === 'owner' || callerRole === 'admin';

    const liveList = getLiveParticipants(id);
    const liveIds = new Set(liveList.map((p) => p.userId));

    const membersRaw = await dbAsync.all(
      `SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.avatar_frame,
              u.profile_theme, u.theme_primary, u.theme_secondary, u.status_mode, u.status_text,
              COALESCE(rr.role, CASE WHEN ? = u.id THEN 'owner' ELSE 'member' END) AS role
       FROM room_memberships rm
       JOIN users u ON u.id = rm.user_id
       LEFT JOIN room_roles rr ON rr.room_id = rm.room_id AND rr.user_id = rm.user_id
       WHERE rm.room_id = ?`,
      [room.host_id, id]
    );

    const members = membersRaw.map((m) => {
      const presence = getUserPresence(m.id, { includeInvisible: m.id === req.user.id });
      const visibleOnline = m.id === req.user.id ? true : presence.online;
      return {
        ...m,
        role: m.id === room.host_id ? 'owner' : m.role,
        online: visibleOnline,
        statusMode: visibleOnline ? presence.statusMode : 'offline',
        listening: visibleOnline ? presence.listening : null,
        isLive: liveIds.has(m.id) && (m.id === req.user.id || presence.online)
      };
    });

    // Sort: owner -> admin -> live -> online -> offline
    members.sort((a, b) => {
      const rank = { owner: 3, admin: 2, member: 1 };
      if (rank[b.role] !== rank[a.role]) return rank[b.role] - rank[a.role];
      if (b.isLive !== a.isLive) return b.isLive ? 1 : -1;
      if (b.online !== a.online) return b.online ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    const bans = isPrivileged
      ? await dbAsync.all(
          `SELECT rb.user_id AS id, u.name, u.avatar_color, u.avatar_url, u.avatar_frame, rb.created_at
           FROM room_bans rb
           JOIN users u ON u.id = rb.user_id
           WHERE rb.room_id = ?`,
          [id]
        )
      : [];

    const requests = isPrivileged
      ? await dbAsync.all(
          `SELECT rjr.id, rjr.user_id, u.name, u.avatar_color, u.avatar_url, u.avatar_frame, rjr.created_at
           FROM room_join_requests rjr
           JOIN users u ON u.id = rjr.user_id
           WHERE rjr.room_id = ? AND rjr.status = 'pending'`,
          [id]
        )
      : [];

    res.json({ members, bans, requests });
  } catch (err) {
    console.error('Fetch members error:', err);
    res.status(500).json({ error: 'Failed to fetch room members' });
  }
});

// Promote / Demote Admin (Owner only)
router.post('/:id/roles', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetUserId, role } = req.body; // 'admin' | 'member'
    const callerRole = await getUserRoomRole(id, req.user.id);
    if (callerRole !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can manage admin roles' });
    }
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await dbAsync.run(
      `INSERT INTO room_roles (room_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role`,
      [id, targetUserId, role]
    );

    // Update live participant if online in room
    const liveRoom = getLiveRoom(id);
    for (const p of liveRoom.participants.values()) {
      if (p.userId === targetUserId) {
        p.role = role;
        p.isHost = role === 'admin' || role === 'owner';
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('room-members-updated');
      io.to(id).emit('participants-sync', getLiveParticipants(id));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Ban User from Room (Owner/Admin)
router.post('/:id/ban', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetUserId } = req.body;
    const callerRole = await getUserRoomRole(id, req.user.id);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions to ban' });
    }

    const room = await dbAsync.get('SELECT host_id FROM rooms WHERE id = ?', [id]);
    const targetRole = await getUserRoomRole(id, targetUserId);
    if ((room && room.host_id === targetUserId) || targetRole === 'owner') {
      return res.status(400).json({ error: 'Cannot ban the room owner' });
    }
    if (targetRole === 'admin' && callerRole !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can ban an admin' });
    }

    await dbAsync.run(
      `INSERT INTO room_bans (room_id, user_id, banned_by, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO NOTHING`,
      [id, targetUserId, req.user.id, Date.now()]
    );
    await dbAsync.run('DELETE FROM room_memberships WHERE room_id = ? AND user_id = ?', [id, targetUserId]);

    const io = req.app.get('io');
    if (io) {
      // Kick target if currently live in the room
      const liveRoom = getLiveRoom(id);
      for (const [sid, p] of liveRoom.participants.entries()) {
        if (p.userId === targetUserId) {
          io.to(sid).emit('kicked-from-room', { roomId: id, reason: 'You were banned from this room.' });
        }
      }
      io.to(id).emit('room-members-updated');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// Unban User
router.delete('/:id/ban/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const callerRole = await getUserRoomRole(id, req.user.id);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await dbAsync.run('DELETE FROM room_bans WHERE room_id = ? AND user_id = ?', [id, targetUserId]);
    const io = req.app.get('io');
    if (io) io.to(id).emit('room-members-updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// Invite Friend to Room (Registered accounts only — prevents guest link/invite spam)
router.post('/:id/invite', authMiddleware, requireRegisteredUser, async (req, res) => {
  try {
    const { id } = req.params;
    const targetId = req.body.friendId || req.body.targetUserId;
    if (!targetId) return res.status(400).json({ error: 'Target user ID required' });
    const room = await dbAsync.get('SELECT id, name FROM rooms WHERE id = ?', [id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const io = req.app.get('io');
    await pushNotification(io, targetId, {
      type: 'room_invite',
      title: `${req.user.name} invited you to "${room.name}"`,
      body: 'Click Join Room to hop in together.',
      data: { roomId: room.id, roomName: room.name, inviterId: req.user.id, inviterName: req.user.name }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// Verify room password
router.post('/:id/verify-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const room = await dbAsync.get('SELECT password_hash, visibility, is_locked FROM rooms WHERE id = ?', [id]);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if ((room.visibility !== 'private' && !room.is_locked) || !room.password_hash) {
      return res.json({ valid: true });
    }

    const match = await comparePassword(password || '', room.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect room password', valid: false });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('Verify password error:', err);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// End Meeting for All (Owner only - Zoom/Google Meet style)
router.post('/:id/end', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRoomRole(id, req.user.id);
    if (role !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can end the meeting for everyone' });
    }

    const liveRoom = getLiveRoom(id);
    const io = req.app.get('io');
    const endedBy = req.user.name || 'Room Owner';

    for (const [, p] of liveRoom.participants.entries()) {
      setUserRoomPresence(p.userId, null, null);
    }

    if (io) {
      io.to(id).emit('room-ended-for-all', { roomId: id, endedBy });
      io.emit('room-count-update', { roomId: id, count: 0 });
    }

    liveRoom.participants.clear();
    res.json({ success: true });
  } catch (err) {
    console.error('End room error:', err);
    res.status(500).json({ error: 'Failed to end room for all' });
  }
});

// Remove room from user's joined history (or delete if host)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const room = await dbAsync.get('SELECT host_id FROM rooms WHERE id = ?', [id]);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.host_id === req.user.id) {
      cleanupLiveRoom(id, req.app.get('io'), req.user.name || 'Room Owner');
      await deleteRoomCompletely(id);
    } else {
      await dbAsync.run('DELETE FROM room_memberships WHERE user_id = ? AND room_id = ?', [req.user.id, id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ error: 'Failed to remove room' });
  }
});

module.exports = router;
