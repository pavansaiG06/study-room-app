const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// Get current user's note
router.get('/', async (req, res) => {
  try {
    const note = await dbAsync.get('SELECT content, updated_at FROM notes WHERE user_id = ?', [req.user.id]);
    res.json({ content: note ? note.content : '', updated_at: note ? note.updated_at : null });
  } catch (err) {
    console.error('Fetch note error:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// Upsert note
router.put('/', async (req, res) => {
  try {
    const content = req.body.content ?? '';
    const now = Date.now();
    const existing = await dbAsync.get('SELECT id FROM notes WHERE user_id = ?', [req.user.id]);

    if (existing) {
      await dbAsync.run('UPDATE notes SET content = ?, updated_at = ? WHERE user_id = ?', [content, now, req.user.id]);
    } else {
      const id = crypto.randomUUID();
      await dbAsync.run(
        'INSERT INTO notes (id, user_id, content, updated_at) VALUES (?, ?, ?, ?)',
        [id, req.user.id, content, now]
      );
    }

    res.json({ success: true, updated_at: now });
  } catch (err) {
    console.error('Save note error:', err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

module.exports = router;
