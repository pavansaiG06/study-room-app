const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware, requireRegisteredUser } = require('../auth');
const { getSuperAdminEmail } = require('../config');
const { pushNotification } = require('../roomsManager');

const VALID_TARGET_TYPES = ['user', 'message', 'room', 'activity'];
const VALID_SEVERITIES = ['low', 'medium', 'high'];
const VALID_STATUSES = ['submitted', 'under_review', 'resolved', 'dismissed'];

async function getUserRoomRole(roomId, userId) {
  if (!roomId || !userId) return 'member';
  const room = await dbAsync.get('SELECT host_id FROM rooms WHERE id = ?', [roomId]);
  if (!room) return null;
  if (room.host_id === userId) return 'owner';
  const roleRow = await dbAsync.get('SELECT role FROM room_roles WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return roleRow ? roleRow.role : 'member';
}

// Submit a safety / restricted-activity report (registered accounts only — anti-spam)
router.post('/', authMiddleware, requireRegisteredUser, async (req, res) => {
  try {
    const {
      targetUserId = null,
      roomId = null,
      targetType = 'user',
      category,
      severity = 'medium',
      description,
      evidenceImage = null,
      notifyHost = true,
      alsoBlock = false
    } = req.body;

    if (!category || !String(category).trim()) {
      return res.status(400).json({ error: 'Please select a report category' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'Please describe what happened so moderators can review it' });
    }

    const cleanType = VALID_TARGET_TYPES.includes(targetType) ? targetType : 'user';
    const cleanSeverity = VALID_SEVERITIES.includes(severity) ? severity : 'medium';
    const cleanCategory = String(category).trim().slice(0, 64);
    const cleanDescription = String(description).trim().slice(0, 1500);
    const cleanEvidence =
      typeof evidenceImage === 'string' && evidenceImage.trim()
        ? evidenceImage.trim().slice(0, 4_000_000)
        : null;

    const id = crypto.randomUUID();
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO reports (
         id, reporter_id, target_user_id, room_id, target_type,
         category, severity, description, evidence_image, status, reviewer_note, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', '', ?)`,
      [id, req.user.id, targetUserId || null, roomId || null, cleanType, cleanCategory, cleanSeverity, cleanDescription, cleanEvidence, now]
    );

    if (alsoBlock && targetUserId && targetUserId !== req.user.id) {
      await dbAsync.run(
        'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
        [req.user.id, targetUserId, targetUserId, req.user.id]
      );
      await dbAsync.run(
        'INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES (?, ?, ?, "blocked", ?)',
        [crypto.randomUUID(), req.user.id, targetUserId, now]
      );
    }

    const io = req.app.get('io');
    const notifiedUsers = new Set([req.user.id]);

    if (notifyHost && roomId) {
      const room = await dbAsync.get('SELECT id, name, host_id FROM rooms WHERE id = ?', [roomId]);
      if (room) {
        const admins = await dbAsync.all("SELECT user_id FROM room_roles WHERE room_id = ? AND role = 'admin'", [roomId]);
        const recipients = new Set([room.host_id, ...admins.map((a) => a.user_id)].filter(Boolean));
        for (const uid of recipients) {
          if (notifiedUsers.has(uid)) continue;
          notifiedUsers.add(uid);
          await pushNotification(io, uid, {
            type: 'safety_report',
            title: `New ${cleanSeverity} safety report in "${room.name}"`,
            body: `Category: ${cleanCategory} — Open the Room Member → Reports panel to review.`,
            data: { roomId, reportId: id, category: cleanCategory, severity: cleanSeverity }
          });
        }
        if (io) io.to(roomId).emit('room-reports-updated', { roomId });
      }
    }

    // Also alert the Platform Super-Admin in their Notification Center
    const superAdminEmail = getSuperAdminEmail();
    if (superAdminEmail) {
      const adminRow = await dbAsync.get(
        'SELECT id FROM users WHERE LOWER(email) = ? AND is_guest = 0',
        [superAdminEmail]
      );
      if (adminRow && !notifiedUsers.has(adminRow.id)) {
        await pushNotification(io, adminRow.id, {
          type: 'safety_report',
          title: `Platform Report (${cleanSeverity}): ${cleanCategory}`,
          body: `${req.user.name} submitted a report. Review it in Global Reports.`,
          data: { reportId: id, roomId, category: cleanCategory, severity: cleanSeverity }
        });
      }
    }

    const created = await dbAsync.get('SELECT * FROM reports WHERE id = ?', [id]);
    res.status(201).json({ report: created });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Get current user's submitted reports
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const reports = await dbAsync.all(
      `SELECT rep.*, u.name AS target_user_name, r.name AS room_name
       FROM reports rep
       LEFT JOIN users u ON u.id = rep.target_user_id
       LEFT JOIN rooms r ON r.id = rep.room_id
       WHERE rep.reporter_id = ?
       ORDER BY rep.created_at DESC`,
      [req.user.id]
    );
    res.json({ reports });
  } catch (err) {
    console.error('Fetch my reports error:', err);
    res.status(500).json({ error: 'Failed to load your reports' });
  }
});

// Get reports across all rooms where current user is Owner or Admin
router.get('/moderated', authMiddleware, async (req, res) => {
  try {
    const reports = await dbAsync.all(
      `SELECT rep.*, r.name AS room_name,
              reporter.name AS reporter_name, target.name AS target_user_name
       FROM reports rep
       JOIN rooms r ON r.id = rep.room_id
       LEFT JOIN room_roles rr ON rr.room_id = r.id AND rr.user_id = ?
       LEFT JOIN users reporter ON reporter.id = rep.reporter_id
       LEFT JOIN users target ON target.id = rep.target_user_id
       WHERE r.host_id = ? OR rr.role IN ('owner', 'admin')
       ORDER BY rep.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json({ reports });
  } catch (err) {
    console.error('Fetch moderated reports error:', err);
    res.status(500).json({ error: 'Failed to load moderated room reports' });
  }
});

// Get reports filed inside a room (Room Owner / Admin only)
router.get('/room/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const role = await getUserRoomRole(roomId, req.user.id);
    if (!role) return res.status(404).json({ error: 'Room not found' });
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'Only room owner or admins can review room reports' });
    }

    const reports = await dbAsync.all(
      `SELECT rep.*, reporter.name AS reporter_name, reporter.avatar_color AS reporter_avatar_color,
              target.name AS target_user_name, target.avatar_color AS target_avatar_color
       FROM reports rep
       LEFT JOIN users reporter ON reporter.id = rep.reporter_id
       LEFT JOIN users target ON target.id = rep.target_user_id
       WHERE rep.room_id = ?
       ORDER BY rep.created_at DESC`,
      [roomId]
    );
    res.json({ reports });
  } catch (err) {
    console.error('Fetch room reports error:', err);
    res.status(500).json({ error: 'Failed to load room reports' });
  }
});

// Review / update report status (Room Owner / Admin only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer_note } = req.body;

    const existing = await dbAsync.get('SELECT * FROM reports WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Report not found' });

    if (existing.room_id) {
      const role = await getUserRoomRole(existing.room_id, req.user.id);
      if (role !== 'owner' && role !== 'admin') {
        return res.status(403).json({ error: 'Only room owner or admins can update room reports' });
      }
    } else if (existing.reporter_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this global report' });
    }

    const updates = [];
    const params = [];
    if (status !== undefined && VALID_STATUSES.includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }
    if (reviewer_note !== undefined) {
      updates.push('reviewer_note = ?');
      params.push(String(reviewer_note).trim().slice(0, 500));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    params.push(id);
    await dbAsync.run(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await dbAsync.get('SELECT * FROM reports WHERE id = ?', [id]);
    const io = req.app.get('io');

    if (existing.room_id && io) {
      io.to(existing.room_id).emit('room-reports-updated', { roomId: existing.room_id });
    }
    if (status && existing.reporter_id !== req.user.id) {
      await pushNotification(io, existing.reporter_id, {
        type: 'report_update',
        title: `Your report (${existing.category}) was marked ${status.replace('_', ' ')}`,
        body: reviewer_note ? `Note from moderator: ${String(reviewer_note).slice(0, 120)}` : 'Thank you for helping keep StudyHub safe.',
        data: { reportId: id, roomId: existing.room_id }
      });
    }

    res.json({ report: updated });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

module.exports = router;
