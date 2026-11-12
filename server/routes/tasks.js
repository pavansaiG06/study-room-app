const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// Get all tasks for current user
router.get('/', async (req, res) => {
  try {
    const tasks = await dbAsync.all(
      'SELECT id, text, completed, created_at FROM tasks WHERE user_id = ? ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json({ tasks: tasks.map(t => ({ ...t, completed: !!t.completed })) });
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Task text is required' });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    await dbAsync.run(
      'INSERT INTO tasks (id, user_id, text, completed, created_at) VALUES (?, ?, ?, 0, ?)',
      [id, req.user.id, text, now]
    );

    res.status(201).json({ task: { id, text, completed: false, created_at: now } });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task (toggle complete or update text)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, text } = req.body;

    const task = await dbAsync.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = [];
    const params = [];

    if (completed !== undefined) {
      updates.push('completed = ?');
      params.push(completed ? 1 : 0);
    }
    if (text !== undefined) {
      updates.push('text = ?');
      params.push(text.trim());
    }

    if (updates.length > 0) {
      params.push(id, req.user.id);
      await dbAsync.run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params);
    }

    const updated = await dbAsync.get('SELECT id, text, completed, created_at FROM tasks WHERE id = ?', [id]);
    res.json({ task: { ...updated, completed: !!updated.completed } });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbAsync.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
