const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware, requireGlobalAdmin } = require('../auth');
const { isSuperAdminEmail } = require('../config');
const { deleteUserCompletely, deleteRoomCompletely, cleanupLiveRoom } = require('../userCleanup');
const {
  onlineUsers,
  liveRooms,
  getLiveRoom,
  getParticipantCount,
  getUserPresence,
  getSocketIdsForUser,
  setUserRoomPresence,
  pushNotification
} = require('../roomsManager');

router.use(authMiddleware, requireGlobalAdmin);

async function writeAuditLog(adminUser, action, targetType, targetId, details = '') {
  try {
    await dbAsync.run(
      `INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        adminUser.id,
        adminUser.email || '',
        action,
        targetType,
        targetId || null,
        String(details).slice(0, 600),
        Date.now()
      ]
    );
  } catch (err) {
    console.error('Failed to write admin audit log:', err);
  }
}

// 1. Platform Overview & Telemetry
router.get('/overview', async (req, res) => {
  try {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const [
      userCounts,
      roomCounts,
      reportCounts,
      warnCounts,
      recentSignups,
      activeAnnouncement
    ] = await Promise.all([
      dbAsync.get(`
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN is_guest = 0 THEN 1 ELSE 0 END) AS registeredUsers,
          SUM(CASE WHEN is_guest = 1 THEN 1 ELSE 0 END) AS guestUsers,
          SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) AS bannedUsers,
          SUM(CASE WHEN chat_muted_until IS NOT NULL AND chat_muted_until > ? THEN 1 ELSE 0 END) AS mutedUsers,
          COALESCE(SUM(total_focus_minutes), 0) AS totalFocusMinutes
        FROM users
      `, [now]),
      dbAsync.get('SELECT COUNT(*) AS totalRooms FROM rooms'),
      dbAsync.get(`
        SELECT
          COUNT(*) AS totalReportsCount,
          SUM(CASE WHEN status IN ('submitted', 'under_review') THEN 1 ELSE 0 END) AS openReportsCount
        FROM reports
      `),
      dbAsync.get('SELECT COUNT(*) AS warningsCount FROM user_warnings'),
      dbAsync.get('SELECT COUNT(*) AS count FROM users WHERE created_at >= ?', [sevenDaysAgo]),
      dbAsync.get('SELECT id, title, message, level, created_at FROM system_announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1')
    ]);

    let activeRoomsCount = 0;
    let liveParticipantsCount = 0;
    for (const room of liveRooms.values()) {
      const size = room.participants.size;
      if (size > 0) {
        activeRoomsCount += 1;
        liveParticipantsCount += size;
      }
    }

    res.json({
      stats: {
        totalUsers: userCounts?.totalUsers || 0,
        registeredUsers: userCounts?.registeredUsers || 0,
        guestUsers: userCounts?.guestUsers || 0,
        bannedUsers: userCounts?.bannedUsers || 0,
        mutedUsers: userCounts?.mutedUsers || 0,
        totalFocusMinutes: userCounts?.totalFocusMinutes || 0,
        onlineUsersCount: onlineUsers.size,
        totalRooms: roomCounts?.totalRooms || 0,
        activeRoomsCount,
        liveParticipantsCount,
        openReportsCount: reportCounts?.openReportsCount || 0,
        totalReportsCount: reportCounts?.totalReportsCount || 0,
        warningsCount: warnCounts?.warningsCount || 0,
        recentSignups7d: recentSignups?.count || 0
      },
      activeAnnouncement: activeAnnouncement || null
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to load platform analytics' });
  }
});

// 2. Search & Filter All Platform Users
router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const filter = (req.query.filter || 'all').toLowerCase();
    const now = Date.now();

    const rows = await dbAsync.all(
      `SELECT id, email, name, username, avatar_color, avatar_url, avatar_frame,
              is_guest, is_banned, ban_reason, banned_at, warning_count, chat_muted_until,
              study_streak, total_focus_minutes, last_seen, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 300`
    );

    const enriched = rows
      .map((u) => {
        const presence = getUserPresence(u.id, { includeInvisible: true });
        return {
          ...u,
          is_guest: !!u.is_guest,
          is_banned: !!u.is_banned,
          is_admin: !u.is_guest && isSuperAdminEmail(u.email),
          is_muted: !!(u.chat_muted_until && u.chat_muted_until > now),
          online: onlineUsers.has(u.id),
          statusMode: onlineUsers.has(u.id) ? presence.statusMode : 'offline',
          currentRoomId: presence.currentRoomId,
          currentRoomName: presence.currentRoomName
        };
      })
      .filter((u) => {
        if (q) {
          const hay = `${u.name || ''} ${u.email || ''} ${u.username || ''} ${u.id}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === 'registered') return !u.is_guest;
        if (filter === 'guests') return u.is_guest;
        if (filter === 'banned') return u.is_banned;
        if (filter === 'warned') return (u.warning_count || 0) > 0;
        if (filter === 'muted') return u.is_muted;
        if (filter === 'online') return u.online;
        return true;
      });

    res.json({ users: enriched });
  } catch (err) {
    console.error('Admin fetch users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// 3. Detailed User History (Warnings + Reports + Rooms)
router.get('/users/:id/history', async (req, res) => {
  try {
    const targetId = req.params.id;
    const [warnings, reportsAgainst, reportsSubmitted, roomsOwned] = await Promise.all([
      dbAsync.all('SELECT * FROM user_warnings WHERE user_id = ? ORDER BY created_at DESC', [targetId]),
      dbAsync.all(
        `SELECT rep.*, r.name AS room_name, reporter.name AS reporter_name
         FROM reports rep
         LEFT JOIN rooms r ON r.id = rep.room_id
         LEFT JOIN users reporter ON reporter.id = rep.reporter_id
         WHERE rep.target_user_id = ?
         ORDER BY rep.created_at DESC`,
        [targetId]
      ),
      dbAsync.all('SELECT id, category, severity, status, created_at FROM reports WHERE reporter_id = ? ORDER BY created_at DESC', [targetId]),
      dbAsync.all('SELECT id, name, visibility, created_at FROM rooms WHERE host_id = ? ORDER BY created_at DESC', [targetId])
    ]);

    res.json({ warnings, reportsAgainst, reportsSubmitted, roomsOwned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user history' });
  }
});

// 4. Issue Official Graduated Warning
router.post('/users/:id/warn', async (req, res) => {
  try {
    const targetId = req.params.id;
    const { reason, severity = 'warning' } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Warning reason is required' });
    }

    const target = await dbAsync.get('SELECT id, name, email, is_guest FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.is_guest && isSuperAdminEmail(target.email)) {
      return res.status(400).json({ error: 'Cannot issue warnings to the platform administrator' });
    }

    const cleanSeverity = ['notice', 'warning', 'final_warning'].includes(severity) ? severity : 'warning';
    const cleanReason = String(reason).trim().slice(0, 500);
    const id = crypto.randomUUID();
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO user_warnings (id, user_id, issued_by, reason, severity, acknowledged, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [id, targetId, req.user.id, cleanReason, cleanSeverity, now]
    );
    await dbAsync.run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1 WHERE id = ?', [targetId]);

    const io = req.app.get('io');
    await pushNotification(io, targetId, {
      type: 'admin_warning',
      title: `Official Platform ${cleanSeverity.replace('_', ' ').toUpperCase()}`,
      body: cleanReason,
      data: { warningId: id, severity: cleanSeverity }
    });
    if (io) {
      getSocketIdsForUser(targetId).forEach((sid) => {
        io.to(sid).emit('admin-warning', { id, reason: cleanReason, severity: cleanSeverity, created_at: now });
      });
    }

    await writeAuditLog(req.user, 'issue_warning', 'user', targetId, `[${cleanSeverity}] ${target.name}: ${cleanReason}`);
    res.status(201).json({ success: true, warningId: id });
  } catch (err) {
    console.error('Warn user error:', err);
    res.status(500).json({ error: 'Failed to issue warning' });
  }
});

// 5. Permanently Ban User from Website
router.post('/users/:id/ban', async (req, res) => {
  try {
    const targetId = req.params.id;
    const reason = String(req.body.reason || 'Violated community safety guidelines').trim().slice(0, 400);

    const target = await dbAsync.get('SELECT id, name, email, is_guest FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id || (!target.is_guest && isSuperAdminEmail(target.email))) {
      return res.status(400).json({ error: 'Cannot ban the platform administrator account' });
    }

    const now = Date.now();
    await dbAsync.run(
      'UPDATE users SET is_banned = 1, ban_reason = ?, banned_at = ?, banned_by = ? WHERE id = ?',
      [reason, now, req.user.id, targetId]
    );

    const io = req.app.get('io');
    if (io) {
      // Immediately boot user from all sockets and live rooms
      for (const sid of getSocketIdsForUser(targetId)) {
        io.to(sid).emit('account-banned', { reason });
        io.to(sid).emit('kicked-from-room', { reason: `Account permanently banned: ${reason}` });
      }
      for (const [roomId, liveRoom] of liveRooms.entries()) {
        let changed = false;
        for (const [sid, p] of liveRoom.participants.entries()) {
          if (p.userId === targetId) {
            liveRoom.participants.delete(sid);
            changed = true;
          }
        }
        if (changed) {
          io.to(roomId).emit('participants-sync', Array.from(liveRoom.participants.values()));
          io.emit('room-count-update', { roomId, count: liveRoom.participants.size });
        }
      }
    }

    await writeAuditLog(req.user, 'ban_user', 'user', targetId, `Banned ${target.name} (${target.email || 'guest'}): ${reason}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Ban user error:', err);
    res.status(500).json({ error: 'Failed to permanently ban user' });
  }
});

// 6. Lift Permanent Ban
router.post('/users/:id/unban', async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await dbAsync.get('SELECT id, name, email FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    await dbAsync.run("UPDATE users SET is_banned = 0, ban_reason = '', banned_at = NULL, banned_by = NULL WHERE id = ?", [targetId]);
    await writeAuditLog(req.user, 'unban_user', 'user', targetId, `Unbanned ${target.name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// 7. Temporary Feature-Specific Chat Timeout (or Clear Timeout when minutes === 0)
router.post('/users/:id/mute', async (req, res) => {
  try {
    const targetId = req.params.id;
    const minutes = Math.max(0, parseInt(req.body.minutes, 10) || 0);
    const target = await dbAsync.get('SELECT id, name, email, is_guest FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.is_guest && isSuperAdminEmail(target.email)) {
      return res.status(400).json({ error: 'Cannot mute the platform administrator' });
    }

    const mutedUntil = minutes > 0 ? Date.now() + minutes * 60 * 1000 : null;
    await dbAsync.run('UPDATE users SET chat_muted_until = ? WHERE id = ?', [mutedUntil, targetId]);

    const io = req.app.get('io');
    if (io) {
      getSocketIdsForUser(targetId).forEach((sid) => {
        io.to(sid).emit('moderation-notice', {
          message: minutes > 0 ? `Platform Admin muted your chat for ${minutes} minutes.` : 'Platform Admin restored your chat privileges.',
          field: 'chat',
          allowed: minutes === 0
        });
      });
    }

    await writeAuditLog(
      req.user,
      minutes > 0 ? 'mute_user_chat' : 'unmute_user_chat',
      'user',
      targetId,
      minutes > 0 ? `Muted ${target.name} for ${minutes}m` : `Unmuted ${target.name}`
    );
    res.json({ success: true, chat_muted_until: mutedUntil });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update chat timeout' });
  }
});

// 8. Database Hygiene: Purge Idle Stale Guest Accounts
router.delete('/users/guests/cleanup', async (req, res) => {
  try {
    const olderThanHours = Math.max(1, parseInt(req.query.hours, 10) || 24);
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const idleGuests = await dbAsync.all('SELECT id FROM users WHERE is_guest = 1 AND created_at < ?', [cutoff]);

    const io = req.app.get('io');
    let deleted = 0;
    for (const g of idleGuests) {
      if (!onlineUsers.has(g.id)) {
        const resDel = await deleteUserCompletely(g.id, io);
        if (resDel.deleted) deleted += 1;
      }
    }

    await writeAuditLog(req.user, 'purge_guests', 'system', null, `Purged ${deleted} stale guest accounts older than ${olderThanHours}h`);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: 'Guest cleanup failed' });
  }
});

// 8b. Permanently Delete Any Non-Admin User Account (Admin Lifecycle Control)
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await dbAsync.get('SELECT id, name, email, is_guest FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id || (!target.is_guest && isSuperAdminEmail(target.email))) {
      return res.status(400).json({ error: 'Cannot delete the platform administrator account' });
    }

    await deleteUserCompletely(targetId, req.app.get('io'), 'Your account was permanently deleted by a platform administrator.');
    await writeAuditLog(req.user, 'delete_user', 'user', targetId, `Deleted user ${target.name} (${target.email || 'guest'})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

// 9. Global Reports Queue
router.get('/reports', async (req, res) => {
  try {
    const reports = await dbAsync.all(
      `SELECT rep.*,
              r.name AS room_name,
              reporter.name AS reporter_name, reporter.email AS reporter_email, reporter.is_guest AS reporter_is_guest,
              target.name AS target_user_name, target.email AS target_user_email, target.is_banned AS target_is_banned
       FROM reports rep
       LEFT JOIN rooms r ON r.id = rep.room_id
       LEFT JOIN users reporter ON reporter.id = rep.reporter_id
       LEFT JOIN users target ON target.id = rep.target_user_id
       ORDER BY
         CASE WHEN rep.status IN ('submitted', 'under_review') THEN 0 ELSE 1 END,
         rep.created_at DESC
       LIMIT 300`
    );
    res.json({ reports });
  } catch (err) {
    console.error('Admin fetch reports error:', err);
    res.status(500).json({ error: 'Failed to fetch platform reports' });
  }
});

// 10. Resolve / Dismiss / Reopen Any Platform Report
router.patch('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer_note = '' } = req.body;
    if (!['submitted', 'under_review', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const existing = await dbAsync.get('SELECT * FROM reports WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Report not found' });

    await dbAsync.run('UPDATE reports SET status = ?, reviewer_note = ? WHERE id = ?', [
      status,
      String(reviewer_note).trim().slice(0, 500),
      id
    ]);

    const io = req.app.get('io');
    if (existing.reporter_id) {
      await pushNotification(io, existing.reporter_id, {
        type: 'report_update',
        title: `Platform Admin updated your report (${existing.category}) to "${status.replace('_', ' ')}"`,
        body: reviewer_note ? `Admin note: ${String(reviewer_note).slice(0, 120)}` : 'Thank you for keeping StudyHub safe.',
        data: { reportId: id, roomId: existing.room_id }
      });
    }

    await writeAuditLog(req.user, `report_${status}`, 'report', id, `${existing.category}: ${reviewer_note || 'updated'}`);
    const updated = await dbAsync.get('SELECT * FROM reports WHERE id = ?', [id]);
    res.json({ report: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// 11. All Rooms Monitor
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await dbAsync.all(
      `SELECT r.*, u.name AS host_name, u.email AS host_email
       FROM rooms r
       LEFT JOIN users u ON u.id = r.host_id
       ORDER BY r.created_at DESC
       LIMIT 200`
    );

    const enriched = rooms.map((r) => ({
      ...r,
      is_locked: !!r.is_locked,
      waiting_room: !!r.waiting_room,
      liveParticipantsCount: getParticipantCount(r.id)
    }));

    res.json({ rooms: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// 12. Emergency Room Shutdown or Delete
router.post('/rooms/:roomId/shutdown', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { deleteRoom = false } = req.body || {};
    const room = await dbAsync.get('SELECT id, name FROM rooms WHERE id = ?', [roomId]);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const liveRoom = getLiveRoom(roomId);
    const io = req.app.get('io');

    for (const [, p] of liveRoom.participants.entries()) {
      setUserRoomPresence(p.userId, null, null);
    }
    if (io) {
      io.to(roomId).emit('room-ended-for-all', { roomId, endedBy: 'Platform Administrator' });
      io.emit('room-count-update', { roomId, count: 0 });
    }
    liveRoom.participants.clear();

    if (deleteRoom) {
      await deleteRoomCompletely(roomId);
    } else {
      await dbAsync.run('UPDATE rooms SET is_locked = 1, waiting_room = 1 WHERE id = ?', [roomId]);
    }

    await writeAuditLog(
      req.user,
      deleteRoom ? 'delete_room' : 'close_room',
      'room',
      roomId,
      `${deleteRoom ? 'Deleted' : 'Locked & ended'} room "${room.name}"`
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to shut down room' });
  }
});

// 13. Immutable Admin Audit Logs
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await dbAsync.all('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 200');
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// 14. Global Platform Announcements
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await dbAsync.all('SELECT * FROM system_announcements ORDER BY created_at DESC LIMIT 20');
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, message, level = 'info' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

    const cleanLevel = ['info', 'warning', 'urgent'].includes(level) ? level : 'info';
    const id = crypto.randomUUID();
    const now = Date.now();

    await dbAsync.run('UPDATE system_announcements SET is_active = 0 WHERE is_active = 1');
    await dbAsync.run(
      'INSERT INTO system_announcements (id, title, message, level, is_active, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [id, String(title).trim().slice(0, 100), String(message).trim().slice(0, 400), cleanLevel, req.user.id, now]
    );

    const announcement = { id, title: String(title).trim(), message: String(message).trim(), level: cleanLevel, is_active: 1, created_at: now };
    const io = req.app.get('io');
    if (io) io.emit('system-announcement', announcement);

    await writeAuditLog(req.user, 'broadcast_announcement', 'system', id, `[${cleanLevel}] ${announcement.title}`);
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ error: 'Failed to broadcast announcement' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await dbAsync.run('UPDATE system_announcements SET is_active = 0 WHERE id = ?', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('system-announcement', null);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear announcement' });
  }
});

module.exports = router;
