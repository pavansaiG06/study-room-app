const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbAsync } = require('./db');
const { isSuperAdminEmail } = require('./config');

const JWT_SECRET = process.env.JWT_SECRET || 'studyhub-super-secret-key-change-in-production';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email || null,
      is_guest: !!user.is_guest,
      is_admin: !user.is_guest && isSuperAdminEmail(user.email),
      tv: user.token_version || 0
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbUser = await dbAsync.get(
      'SELECT id, name, email, is_guest, is_banned, ban_reason, chat_muted_until, token_version FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!dbUser) {
      return res.status(401).json({ error: 'User account not found' });
    }
    if (decoded.tv !== undefined && decoded.tv !== (dbUser.token_version || 0)) {
      return res.status(401).json({ error: 'Session expired or signed out from another device.' });
    }
    if (dbUser.is_banned) {
      return res.status(403).json({
        error: dbUser.ban_reason
          ? `Account permanently banned: ${dbUser.ban_reason}`
          : 'Your account has been permanently banned from StudyHub.',
        banned: true,
        banReason: dbUser.ban_reason || ''
      });
    }

    req.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email || null,
      is_guest: !!dbUser.is_guest,
      is_admin: !dbUser.is_guest && isSuperAdminEmail(dbUser.email),
      chat_muted_until: dbUser.chat_muted_until || null,
      token_version: dbUser.token_version || 0
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const dbUser = await dbAsync.get(
        'SELECT id, name, email, is_guest, is_banned, chat_muted_until, token_version FROM users WHERE id = ?',
        [decoded.id]
      );
      const validTv = decoded.tv === undefined || decoded.tv === (dbUser?.token_version || 0);
      if (dbUser && !dbUser.is_banned && validTv) {
        req.user = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email || null,
          is_guest: !!dbUser.is_guest,
          is_admin: !dbUser.is_guest && isSuperAdminEmail(dbUser.email),
          chat_muted_until: dbUser.chat_muted_until || null,
          token_version: dbUser.token_version || 0
        };
      }
    } catch {
      // Ignore token failure for optional routes
    }
  }
  next();
}

function requireRegisteredUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.is_guest) {
    return res.status(403).json({
      error: 'Guest accounts are restricted from this feature. Create a free account to unlock it.',
      guestRestricted: true
    });
  }
  next();
}

function requireGlobalAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.user.is_admin || !isSuperAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'Platform administrator privileges required' });
  }
  next();
}

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

async function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

module.exports = {
  generateToken,
  authMiddleware,
  optionalAuthMiddleware,
  requireRegisteredUser,
  requireGlobalAdmin,
  hashPassword,
  comparePassword,
  JWT_SECRET
};
