const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbAsync } = require('../db');
const { generateToken, authMiddleware, optionalAuthMiddleware, requireRegisteredUser, hashPassword, comparePassword } = require('../auth');
const { isSuperAdminEmail } = require('../config');
const { deleteUserCompletely } = require('../userCleanup');
const { onlineUsers, liveRooms, getUserPresence, setUserListening, getLiveParticipants } = require('../roomsManager');
const { fetchYoutubeMetadata } = require('../youtubeMeta');

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];
const VALID_AVATAR_FRAMES = ['none', 'aurora', 'royal', 'crimson', 'violet', 'emerald'];
const USER_SELECT_COLS = `
  id, email, name, username, pronouns, bio, status_text, status_mode, custom_emoji,
  avatar_color, avatar_url, banner_color, banner_url, accent_color,
  profile_theme, theme_primary, theme_secondary, avatar_frame,
  preferences, privacy_settings, voice_settings, study_streak, total_focus_minutes, last_study_date,
  is_banned, ban_reason, warning_count, chat_muted_until,
  token_version, is_guest, last_seen, created_at
`;

function normalizeStatusMode(mode) {
  if (mode === 'available') return 'online';
  if (mode === 'focusing' || mode === 'dnd') return 'busy';
  if (mode === 'break') return 'away';
  if (['online', 'away', 'busy', 'invisible'].includes(mode)) return mode;
  return 'online';
}

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function safeParseJson(val, fallback = {}) {
  if (!val) return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

function formatSafeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || null,
    name: row.name,
    username: row.username || null,
    pronouns: row.pronouns || '',
    bio: row.bio || '',
    status_text: row.status_text || '',
    status_mode: normalizeStatusMode(row.status_mode),
    custom_emoji: row.custom_emoji || '',
    avatar_color: row.avatar_color || '#8b5cf6',
    avatar_url: row.avatar_url || null,
    banner_color: row.banner_color || '#1e1b4b',
    banner_url: row.banner_url || null,
    accent_color: row.accent_color || '#8b5cf6',
    profile_theme: !row.profile_theme || row.profile_theme === 'obsidian' ? 'default' : row.profile_theme,
    theme_primary: row.theme_primary || '#1e1b4b',
    theme_secondary: row.theme_secondary || '#0f172a',
    avatar_frame: row.avatar_frame || 'none',
    preferences: safeParseJson(row.preferences, { pomoWork: 25, pomoBreak: 5, soundEnabled: true, chatDensity: 'cozy', selfViewMode: 'grid' }),
    privacy_settings: safeParseJson(row.privacy_settings, { showBio: 'everyone', allowDMs: 'everyone', allowFriendRequests: 'everyone' }),
    voice_settings: safeParseJson(row.voice_settings, { noiseSuppression: true, echoCancellation: true, autoGain: true, inputMode: 'vad', pttKey: 'Space', soundboardVolume: 80 }),
    study_streak: row.study_streak || 0,
    total_focus_minutes: row.total_focus_minutes || 0,
    last_study_date: row.last_study_date || null,
    is_admin: !row.is_guest && isSuperAdminEmail(row.email),
    is_banned: !!row.is_banned,
    ban_reason: row.ban_reason || '',
    warning_count: row.warning_count || 0,
    chat_muted_until: row.chat_muted_until || null,
    is_guest: !!row.is_guest,
    last_seen: row.last_seen || null,
    created_at: row.created_at
  };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, avatarUrl, avatarColor } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await dbAsync.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const color = avatarColor || randomColor();
    const cleanName = name.trim().slice(0, 40);
    const defaultUsername = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) + Math.floor(10 + Math.random() * 89);
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO users (id, email, password_hash, name, username, avatar_color, avatar_url, banner_color, accent_color, status_mode, is_guest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '#1e1b4b', ?, 'online', 0, ?)`,
      [id, cleanEmail, password_hash, cleanName, defaultUsername, color, avatarUrl || null, color, now]
    );

    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [id]);
    const user = formatSafeUser(row);
    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const row = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!row || !row.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await comparePassword(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (row.is_banned) {
      return res.status(403).json({
        error: row.ban_reason
          ? `This account has been permanently banned: ${row.ban_reason}`
          : 'This account has been permanently banned from StudyHub.',
        banned: true,
        banReason: row.ban_reason || ''
      });
    }

    const user = formatSafeUser(row);
    const token = generateToken({ ...user, token_version: row.token_version || 0 });
    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Guest Quick-Login
router.post('/guest', async (req, res) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 30) || `Student_${Math.floor(1000 + Math.random() * 9000)}`;
    const id = crypto.randomUUID();
    const color = req.body.avatarColor || randomColor();
    const avatarUrl = req.body.avatarUrl || null;
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO users (id, name, avatar_color, avatar_url, banner_color, accent_color, is_guest, created_at)
       VALUES (?, ?, ?, ?, '#1e1b4b', '#8b5cf6', 1, ?)`,
      [id, name, color, avatarUrl, now]
    );

    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [id]);
    const user = formatSafeUser(row);
    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Guest creation error:', err);
    res.status(500).json({ error: 'Server error creating guest' });
  }
});

// Upgrade Guest to Full Registered Account
router.post('/upgrade-guest', authMiddleware, async (req, res) => {
  try {
    const current = await dbAsync.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!current || !current.is_guest) {
      return res.status(400).json({ error: 'Account is already registered' });
    }

    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const emailTaken = await dbAsync.get('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, req.user.id]);
    if (emailTaken) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await hashPassword(password);
    const finalName = (name || current.name).trim().slice(0, 40);
    const defaultUsername = finalName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) + Math.floor(10 + Math.random() * 89);

    await dbAsync.run(
      'UPDATE users SET email = ?, password_hash = ?, name = ?, username = COALESCE(username, ?), is_guest = 0 WHERE id = ?',
      [cleanEmail, password_hash, finalName, defaultUsername, req.user.id]
    );

    const updated = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    const user = formatSafeUser(updated);
    const token = generateToken({ ...user, token_version: updated.token_version || 0 });
    res.json({ user, token });
  } catch (err) {
    console.error('Upgrade guest error:', err);
    res.status(500).json({ error: 'Failed to upgrade account' });
  }
});

// Current User Profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: formatSafeUser(row) });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public User Popout Card (respects privacy settings)
router.get('/users/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [targetId]);
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    const formatted = formatSafeUser(row);
    const isSelf = !!(req.user && req.user.id === targetId);
    const presence = getUserPresence(targetId, { includeInvisible: isSelf });

    // Check friendship if logged in
    let friendshipStatus = 'none';
    if (req.user && req.user.id !== targetId) {
      const rel = await dbAsync.get(
        `SELECT status FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
        [req.user.id, targetId, targetId, req.user.id]
      );
      if (rel) friendshipStatus = rel.status;
    }

    const showBio =
      !formatted.privacy_settings?.showBio ||
      formatted.privacy_settings.showBio === 'everyone' ||
      (formatted.privacy_settings.showBio === 'friends' && friendshipStatus === 'accepted') ||
      isSelf;

    const visibleStatusMode = isSelf
      ? formatted.status_mode
      : presence.online
      ? presence.statusMode
      : 'offline';

    res.json({
      profile: {
        id: formatted.id,
        name: formatted.name,
        username: formatted.username,
        pronouns: formatted.pronouns,
        bio: showBio ? formatted.bio : '',
        status_text: showBio && (isSelf || presence.online) ? formatted.status_text : '',
        status_mode: visibleStatusMode,
        custom_emoji: isSelf || presence.online ? formatted.custom_emoji : '',
        avatar_color: formatted.avatar_color,
        avatar_url: formatted.avatar_url,
        banner_color: formatted.banner_color,
        banner_url: formatted.banner_url,
        accent_color: formatted.accent_color,
        profile_theme: formatted.profile_theme,
        theme_primary: formatted.theme_primary,
        theme_secondary: formatted.theme_secondary,
        avatar_frame: formatted.avatar_frame,
        study_streak: formatted.study_streak,
        total_focus_minutes: formatted.total_focus_minutes,
        is_guest: formatted.is_guest,
        is_admin: !formatted.is_guest && isSuperAdminEmail(formatted.email),
        created_at: formatted.created_at,
        presence,
        friendshipStatus
      }
    });
  } catch (err) {
    console.error('Fetch user card error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Update Profile & Settings
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const current = await dbAsync.get('SELECT id, is_guest FROM users WHERE id = ?', [req.user.id]);
    if (!current) return res.status(404).json({ error: 'User not found' });

    const {
      name,
      avatar_color,
      avatar_url,
      username,
      pronouns,
      bio,
      status_text,
      status_mode,
      custom_emoji,
      banner_color,
      banner_url,
      accent_color,
      profile_theme,
      theme_primary,
      theme_secondary,
      avatar_frame,
      preferences,
      privacy_settings,
      voice_settings,
      email
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim().slice(0, 40));
    }
    if (avatar_color !== undefined) {
      updates.push('avatar_color = ?');
      params.push(avatar_color);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url || null);
    }
    // Quick Discord-style activity status + Voice & Appearance preferences allowed for all users
    if (status_mode !== undefined && ['online', 'away', 'busy', 'invisible', 'available', 'focusing', 'break', 'dnd'].includes(status_mode)) {
      updates.push('status_mode = ?');
      params.push(normalizeStatusMode(status_mode));
    }
    if (status_text !== undefined) {
      updates.push('status_text = ?');
      params.push(String(status_text).trim().slice(0, 60));
    }
    if (custom_emoji !== undefined) {
      updates.push('custom_emoji = ?');
      params.push(String(custom_emoji).trim().slice(0, 8));
    }
    if (preferences !== undefined) {
      updates.push('preferences = ?');
      params.push(JSON.stringify(preferences));
    }
    if (voice_settings !== undefined) {
      updates.push('voice_settings = ?');
      params.push(JSON.stringify(voice_settings));
    }

    // Full identity, profile theme & privacy customization for registered account users
    if (!current.is_guest) {
      if (username !== undefined) {
        const cleanUser = username.trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24);
        updates.push('username = ?');
        params.push(cleanUser || null);
      }
      if (pronouns !== undefined) {
        updates.push('pronouns = ?');
        params.push(String(pronouns).trim().slice(0, 24));
      }
      if (bio !== undefined) {
        updates.push('bio = ?');
        params.push(String(bio).trim().slice(0, 200));
      }
      if (banner_color !== undefined) {
        updates.push('banner_color = ?');
        params.push(banner_color);
      }
      if (banner_url !== undefined) {
        updates.push('banner_url = ?');
        params.push(banner_url || null);
      }
      if (accent_color !== undefined) {
        updates.push('accent_color = ?');
        params.push(accent_color);
      }
      if (profile_theme !== undefined) {
        updates.push('profile_theme = ?');
        params.push(String(profile_theme).trim().slice(0, 32));
      }
      if (theme_primary !== undefined) {
        updates.push('theme_primary = ?');
        params.push(String(theme_primary).trim().slice(0, 24));
      }
      if (theme_secondary !== undefined) {
        updates.push('theme_secondary = ?');
        params.push(String(theme_secondary).trim().slice(0, 24));
      }
      if (avatar_frame !== undefined && VALID_AVATAR_FRAMES.includes(avatar_frame)) {
        updates.push('avatar_frame = ?');
        params.push(avatar_frame);
      }
      if (privacy_settings !== undefined) {
        updates.push('privacy_settings = ?');
        params.push(JSON.stringify(privacy_settings));
      }
      if (email !== undefined && email.trim()) {
        const cleanEmail = email.toLowerCase().trim();
        const emailTaken = await dbAsync.get('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, req.user.id]);
        if (emailTaken) {
          return res.status(409).json({ error: 'That email is already used by another account' });
        }
        updates.push('email = ?');
        params.push(cleanEmail);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update' });
    }

    params.push(req.user.id);
    await dbAsync.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    const user = formatSafeUser(row);

    // Update live onlineUsers state & broadcast presence update
    const entry = onlineUsers.get(req.user.id);
    if (entry) {
      entry.statusMode = user.status_mode;
      entry.statusText = user.status_text;
      entry.customEmoji = user.custom_emoji;
    }
    const io = req.app.get('io');
    if (io) {
      const isInvisible = user.status_mode === 'invisible';
      io.emit('presence-update', {
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatar_url,
        avatarColor: user.avatar_color,
        avatarFrame: user.avatar_frame,
        profileTheme: user.profile_theme,
        themePrimary: user.theme_primary,
        themeSecondary: user.theme_secondary,
        online: !isInvisible,
        statusMode: isInvisible ? 'offline' : user.status_mode,
        statusText: isInvisible ? '' : user.status_text,
        customEmoji: isInvisible ? '' : user.custom_emoji
      });
    }

    res.json({ user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Change Password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and new password (min 6 chars) are required' });
    }

    const row = await dbAsync.get('SELECT password_hash, is_guest FROM users WHERE id = ?', [req.user.id]);
    if (!row || row.is_guest) {
      return res.status(403).json({ error: 'Password changes are only available for registered accounts' });
    }

    const valid = await comparePassword(currentPassword, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await dbAsync.run(
      'UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
      [newHash, req.user.id]
    );
    const updatedRow = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    const refreshedUser = formatSafeUser(updatedRow);
    const refreshedToken = generateToken({ ...refreshedUser, token_version: updatedRow.token_version || 0 });
    res.json({ success: true, user: refreshedUser, token: refreshedToken });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Sign Out All Other Devices / Sessions
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    await dbAsync.run(
      'UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
      [req.user.id]
    );
    const updatedRow = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    const refreshedUser = formatSafeUser(updatedRow);
    const refreshedToken = generateToken({ ...refreshedUser, token_version: updatedRow.token_version || 0 });
    res.json({ success: true, user: refreshedUser, token: refreshedToken });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
});

// Download Personal Data Archive (JSON export)
router.get('/export', authMiddleware, requireRegisteredUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const [profileRow, tasks, notes, ownedRooms, memberships, friendships, reportsSubmitted] = await Promise.all([
      dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [uid]),
      dbAsync.all('SELECT id, text, completed, created_at FROM tasks WHERE user_id = ?', [uid]),
      dbAsync.get('SELECT content, updated_at FROM notes WHERE user_id = ?', [uid]),
      dbAsync.all('SELECT id, name, description, vibe, mode, visibility, created_at FROM rooms WHERE host_id = ?', [uid]),
      dbAsync.all(
        `SELECT r.id, r.name, rm.joined_at, rm.last_joined_at
         FROM room_memberships rm JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = ?`,
        [uid]
      ),
      dbAsync.all('SELECT id, user_id, friend_id, status, note, created_at FROM friendships WHERE user_id = ? OR friend_id = ?', [uid, uid]),
      dbAsync.all('SELECT id, target_type, category, severity, description, status, created_at FROM reports WHERE reporter_id = ?', [uid])
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      account: formatSafeUser(profileRow),
      tasks,
      notes: notes || null,
      ownedRooms,
      joinedRooms: memberships,
      friendships,
      reportsSubmitted
    });
  } catch (err) {
    console.error('Export data error:', err);
    res.status(500).json({ error: 'Failed to export account data' });
  }
});

// Self-Service Permanent Account Deletion
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const row = await dbAsync.get('SELECT id, email, password_hash, is_guest FROM users WHERE id = ?', [req.user.id]);
    if (!row) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!row.is_guest && isSuperAdminEmail(row.email)) {
      return res.status(403).json({
        error: 'The active Platform Super-Admin account cannot be self-deleted for safety.'
      });
    }

    if (!row.is_guest) {
      const password = req.body?.password || '';
      if (!password) {
        return res.status(400).json({ error: 'Please enter your current password to delete your account' });
      }
      const valid = await comparePassword(password, row.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }

    await deleteUserCompletely(req.user.id, req.app.get('io'), 'Your account was permanently deleted.');
    res.json({ success: true });
  } catch (err) {
    console.error('Delete own account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Log completed focus / Pomodoro session and update daily study streak
router.post('/study-log', authMiddleware, async (req, res) => {
  try {
    const mins = Math.min(Math.max(parseInt(req.body.minutes, 10) || 25, 1), 180);
    const current = await dbAsync.get(
      'SELECT study_streak, total_focus_minutes, last_study_date FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!current) return res.status(404).json({ error: 'User not found' });

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let nextStreak = current.study_streak || 0;
    if (current.last_study_date === todayStr) {
      nextStreak = Math.max(1, nextStreak);
    } else if (current.last_study_date === yesterdayStr) {
      nextStreak = nextStreak + 1;
    } else {
      nextStreak = 1;
    }

    const nextMinutes = (current.total_focus_minutes || 0) + mins;
    await dbAsync.run(
      'UPDATE users SET study_streak = ?, total_focus_minutes = ?, last_study_date = ? WHERE id = ?',
      [nextStreak, nextMinutes, todayStr, req.user.id]
    );

    const row = await dbAsync.get(`SELECT ${USER_SELECT_COLS} FROM users WHERE id = ?`, [req.user.id]);
    res.json({ user: formatSafeUser(row), addedMinutes: mins });
  } catch (err) {
    console.error('Study log error:', err);
    res.status(500).json({ error: 'Failed to log focus session' });
  }
});

// Active global platform announcement (public read)
router.get('/announcement', async (req, res) => {
  try {
    const ann = await dbAsync.get(
      'SELECT id, title, message, level, created_at FROM system_announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
    );
    res.json({ announcement: ann || null });
  } catch {
    res.json({ announcement: null });
  }
});

// Fetch official warnings received by the current user
router.get('/warnings', authMiddleware, async (req, res) => {
  try {
    const warnings = await dbAsync.all(
      'SELECT id, reason, severity, acknowledged, created_at FROM user_warnings WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ warnings: warnings.map((w) => ({ ...w, acknowledged: !!w.acknowledged })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load warnings' });
  }
});

// Acknowledge an official admin warning
router.post('/warnings/:id/ack', authMiddleware, async (req, res) => {
  try {
    await dbAsync.run('UPDATE user_warnings SET acknowledged = 1 WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id
    ]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to acknowledge warning' });
  }
});

// Resolve YouTube Video vs Song Metadata (zero-API-key oEmbed + YouTube microformat)
router.get('/youtube/meta', authMiddleware, async (req, res) => {
  try {
    const rawUrl = req.query.url || '';
    const meta = await fetchYoutubeMetadata(rawUrl);
    res.json({ meta });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not resolve YouTube URL' });
  }
});

// Broadcast or clear live YouTube listening activity (Registered accounts only)
router.post('/listening', authMiddleware, requireRegisteredUser, async (req, res) => {
  try {
    const rawUrl = (req.body?.url || '').trim();
    const listening = rawUrl ? await fetchYoutubeMetadata(rawUrl) : null;

    setUserListening(req.user.id, listening);
    const presenceEntry = onlineUsers.get(req.user.id);
    const isInvisible = presenceEntry?.statusMode === 'invisible';

    for (const [roomId, room] of liveRooms.entries()) {
      let updated = false;
      for (const p of room.participants.values()) {
        if (p.userId === req.user.id) {
          p.listening = isInvisible ? null : listening;
          updated = true;
        }
      }
      if (updated) {
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('participants-sync', getLiveParticipants(roomId));
      }
    }

    const io = req.app.get('io');
    if (io && !isInvisible) {
      io.emit('presence-update', { userId: req.user.id, listening });
    }

    res.json({ listening });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update YouTube activity' });
  }
});

// Submit Ban Appeal / Message Admin (Public - for banned users who cannot log in)
router.post('/appeal', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const message = (req.body.message || '').trim().slice(0, 2000);
    const appealType = ['ban_appeal', 'warning_appeal', 'general_inquiry'].includes(req.body.appealType)
      ? req.body.appealType
      : 'ban_appeal';

    if (!email || !message) {
      return res.status(400).json({ error: 'Please provide both your registered email address and appeal message' });
    }

    const user = await dbAsync.get('SELECT id, name, email, is_banned, ban_reason FROM users WHERE email = ?', [email]);
    const id = crypto.randomUUID();
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO user_appeals (id, user_id, email, name, appeal_type, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, user?.id || null, email, user?.name || email.split('@')[0], appealType, message, now]
    );

    res.status(201).json({
      success: true,
      message: 'Your appeal has been securely submitted to the StudyHub Administrator. We will review your plea and notify you.'
    });
  } catch (err) {
    console.error('Submit appeal error:', err);
    res.status(500).json({ error: 'Failed to submit appeal. Please try again later.' });
  }
});

// Submit Appeal / Message Admin (Authenticated - for active or warned users)
router.post('/appeal-authenticated', authMiddleware, async (req, res) => {
  try {
    const message = (req.body.message || '').trim().slice(0, 2000);
    const appealType = ['warning_appeal', 'room_ban_appeal', 'general_inquiry'].includes(req.body.appealType)
      ? req.body.appealType
      : 'warning_appeal';

    if (!message) {
      return res.status(400).json({ error: 'Please provide an appeal message' });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await dbAsync.run(
      `INSERT INTO user_appeals (id, user_id, email, name, appeal_type, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, req.user.id, req.user.email || 'guest', req.user.name, appealType, message, now]
    );

    res.status(201).json({
      success: true,
      message: 'Your message has been delivered to the Administration Team.'
    });
  } catch (err) {
    console.error('Submit authenticated appeal error:', err);
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

// View My Appeals Status
router.get('/my-appeals', authMiddleware, async (req, res) => {
  try {
    const appeals = await dbAsync.all(
      `SELECT id, appeal_type, message, status, admin_response, created_at, resolved_at
       FROM user_appeals
       WHERE user_id = ? OR email = ?
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.id, req.user.email || '']
    );
    res.json({ appeals });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load appeals' });
  }
});

module.exports = router;
