const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware, requireRegisteredUser } = require('../auth');
const { getSocketIdsForUser, pushNotification } = require('../roomsManager');

router.use(authMiddleware);

// Fetch DM history with a user
router.get('/:friendId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId } = req.params;

    const messages = await dbAsync.all(
      `SELECT id, sender_id, receiver_id, text, created_at, read_at
       FROM direct_messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC
       LIMIT 150`,
      [userId, friendId, friendId, userId]
    );

    // Mark incoming messages as read
    await dbAsync.run(
      'UPDATE direct_messages SET read_at = ? WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL',
      [Date.now(), friendId, userId]
    );

    res.json({ messages });
  } catch (err) {
    console.error('Fetch DMs error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send DM (Registered accounts only)
router.post('/:friendId', requireRegisteredUser, async (req, res) => {
  try {
    const senderId = req.user.id;
    const receiverId = req.params.friendId;
    const text = (req.body.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Message cannot be empty' });

    // Check if blocked
    const blocked = await dbAsync.get(
      `SELECT id FROM friendships WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'blocked'`,
      [senderId, receiverId, receiverId, senderId]
    );
    if (blocked) {
      return res.status(403).json({ error: 'Cannot message this user' });
    }

    // Check recipient DM privacy settings
    const receiver = await dbAsync.get('SELECT id, name, privacy_settings FROM users WHERE id = ?', [receiverId]);
    if (!receiver) return res.status(404).json({ error: 'Recipient not found' });

    if (receiver.privacy_settings) {
      try {
        const priv = JSON.parse(receiver.privacy_settings);
        if (priv.allowDMs === 'friends') {
          const isFriend = await dbAsync.get(
            `SELECT id FROM friendships WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'accepted'`,
            [senderId, receiverId, receiverId, senderId]
          );
          if (!isFriend) {
            return res.status(403).json({ error: `${receiver.name} only accepts DMs from friends` });
          }
        }
      } catch {}
    }

    const id = crypto.randomUUID();
    const created_at = Date.now();
    await dbAsync.run(
      'INSERT INTO direct_messages (id, sender_id, receiver_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, senderId, receiverId, text, created_at]
    );

    const sender = await dbAsync.get('SELECT name, avatar_url, avatar_color FROM users WHERE id = ?', [senderId]);
    const message = {
      id,
      sender_id: senderId,
      receiver_id: receiverId,
      text,
      created_at,
      senderName: sender?.name || req.user.name,
      senderAvatarUrl: sender?.avatar_url || null,
      senderAvatarColor: sender?.avatar_color || '#8b5cf6'
    };

    const io = req.app.get('io');
    if (io) {
      getSocketIdsForUser(receiverId).forEach((sid) => {
        io.to(sid).emit('dm-received', message);
      });
      await pushNotification(io, receiverId, {
        type: 'dm',
        title: `New message from ${sender?.name || req.user.name}`,
        body: text.slice(0, 80),
        data: { senderId, senderName: sender?.name || req.user.name }
      });
    }

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send DM error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
