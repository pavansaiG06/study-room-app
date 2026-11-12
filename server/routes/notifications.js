const express = require('express');
const router = express.Router();
const { dbAsync } = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// Fetch user's notifications
router.get('/', async (req, res) => {
  try {
    const rows = await dbAsync.all(
      'SELECT id, type, title, body, data, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );

    const notifications = rows.map((r) => {
      let parsedData = {};
      try {
        parsedData = r.data ? JSON.parse(r.data) : {};
      } catch {}
      return {
        ...r,
        data: parsedData,
        is_read: !!r.is_read
      };
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Mark one or all notifications as read
router.post('/read', async (req, res) => {
  try {
    const { id } = req.body;
    if (id) {
      await dbAsync.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
    } else {
      await dbAsync.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Clear one or all notifications
router.delete('/:id?', async (req, res) => {
  try {
    const { id } = req.params;
    if (id && id !== 'all') {
      await dbAsync.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    } else {
      await dbAsync.run('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

module.exports = router;
