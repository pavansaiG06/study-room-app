const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware, requireRegisteredUser } = require('../auth');
const { getUserPresence, pushNotification } = require('../roomsManager');

router.use(authMiddleware);

// Get all friend relations (friends with live presence, incoming, outgoing, blocked)
router.get('/', async (req, res) => {
  try {
    if (req.user.is_guest) {
      return res.json({ friends: [], incoming: [], outgoing: [], blocked: [] });
    }
    const userId = req.user.id;

    // Accepted friends
    const friendsRaw = await dbAsync.all(
      `SELECT f.id AS friendship_id, u.id, u.name, u.username, u.email, u.avatar_color, u.avatar_url,
              u.avatar_frame, u.profile_theme, u.theme_primary, u.theme_secondary,
              u.pronouns, u.bio, u.status_text, u.status_mode, u.custom_emoji
       FROM friendships f
       JOIN users u ON (u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END)
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'`,
      [userId, userId, userId]
    );

    const friends = friendsRaw.map((f) => {
      const presence = getUserPresence(f.id);
      return {
        ...f,
        online: presence.online,
        liveStatusMode: presence.online ? (presence.statusMode || 'online') : 'offline',
        liveStatusText: presence.online ? (presence.statusText || f.status_text || '') : '',
        currentRoomId: presence.currentRoomId,
        currentRoomName: presence.currentRoomName,
        listening: presence.listening || null
      };
    });

    // Incoming pending requests
    const incoming = await dbAsync.all(
      `SELECT f.id AS request_id, f.note, u.id, u.name, u.username, u.email, u.avatar_color, u.avatar_url, u.avatar_frame, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = ? AND f.status = 'pending'`,
      [userId]
    );

    // Outgoing pending requests
    const outgoing = await dbAsync.all(
      `SELECT f.id AS request_id, f.note, u.id, u.name, u.username, u.email, u.avatar_color, u.avatar_url, u.avatar_frame, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? AND f.status = 'pending'`,
      [userId]
    );

    // Blocked users (blocked by current user)
    const blocked = await dbAsync.all(
      `SELECT f.id AS block_id, u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.avatar_frame, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? AND f.status = 'blocked'`,
      [userId]
    );

    res.json({ friends, incoming, outgoing, blocked });
  } catch (err) {
    console.error('Fetch friends error:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Search users to add (Registered accounts only — prevents guest scraping)
router.get('/search', requireRegisteredUser, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const matches = await dbAsync.all(
      `SELECT id, name, username, email, avatar_color, avatar_url, avatar_frame, status_text, privacy_settings
       FROM users
       WHERE id != ? AND is_guest = 0 AND COALESCE(is_banned, 0) = 0
         AND (name LIKE ? OR email LIKE ? OR username LIKE ?)
       LIMIT 15`,
      [req.user.id, `%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json({ users: matches });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Send friend request (Registered accounts only)
router.post('/request', requireRegisteredUser, async (req, res) => {
  try {
    const { targetUserId, note } = req.body;
    const userId = req.user.id;

    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const target = await dbAsync.get(
      'SELECT id, name, privacy_settings, is_guest, is_banned FROM users WHERE id = ?',
      [targetUserId]
    );
    if (!target || target.is_guest || target.is_banned) {
      return res.status(404).json({ error: 'User not found or unavailable' });
    }

    // Respect privacy setting if user disabled friend requests
    if (target.privacy_settings) {
      try {
        const priv = JSON.parse(target.privacy_settings);
        if (priv.allowFriendRequests === 'none') {
          return res.status(403).json({ error: `${target.name} is not accepting friend requests right now` });
        }
      } catch {}
    }

    // Check existing relation
    const existing = await dbAsync.get(
      `SELECT * FROM friendships
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [userId, targetUserId, targetUserId, userId]
    );

    if (existing) {
      if (existing.status === 'blocked') {
        return res.status(403).json({ error: 'Cannot send request to this user' });
      }
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      }
      return res.status(400).json({ error: 'Friend request already pending' });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const cleanNote = (note || '').trim().slice(0, 120);
    await dbAsync.run(
      'INSERT INTO friendships (id, user_id, friend_id, status, note, created_at) VALUES (?, ?, ?, "pending", ?, ?)',
      [id, userId, targetUserId, cleanNote || null, now]
    );

    const io = req.app.get('io');
    await pushNotification(io, targetUserId, {
      type: 'friend_request',
      title: `Friend request from ${req.user.name}`,
      body: cleanNote || `${req.user.name} wants to be study friends!`,
      data: { requestId: id, fromUserId: userId, fromName: req.user.name }
    });

    res.status(201).json({ success: true, message: `Request sent to ${target.name}` });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Respond to friend request (accept / decline)
router.post('/:requestId/respond', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body; // 'accept' | 'decline'
    const userId = req.user.id;

    const request = await dbAsync.get(
      'SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = "pending"',
      [requestId, userId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (action === 'accept') {
      await dbAsync.run('UPDATE friendships SET status = "accepted" WHERE id = ?', [requestId]);
      const io = req.app.get('io');
      await pushNotification(io, request.user_id, {
        type: 'friend_accepted',
        title: `${req.user.name} accepted your friend request`,
        body: 'You can now message or invite each other to study rooms.',
        data: { friendId: userId }
      });
      res.json({ success: true, status: 'accepted' });
    } else {
      await dbAsync.run('DELETE FROM friendships WHERE id = ?', [requestId]);
      res.json({ success: true, status: 'declined' });
    }
  } catch (err) {
    console.error('Respond friend request error:', err);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

// Block a user
router.post('/block', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;
    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    // Remove existing relationship in either direction, then insert block
    await dbAsync.run(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [userId, targetUserId, targetUserId, userId]
    );

    const id = crypto.randomUUID();
    await dbAsync.run(
      'INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES (?, ?, ?, "blocked", ?)',
      [id, userId, targetUserId, Date.now()]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Block user error:', err);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock a user
router.delete('/block/:targetUserId', async (req, res) => {
  try {
    const { targetUserId } = req.params;
    await dbAsync.run(
      'DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = "blocked"',
      [req.user.id, targetUserId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Remove friend
router.delete('/:friendshipId', async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.id;

    const result = await dbAsync.run(
      'DELETE FROM friendships WHERE id = ? AND (user_id = ? OR friend_id = ?)',
      [friendshipId, userId, userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

module.exports = router;
