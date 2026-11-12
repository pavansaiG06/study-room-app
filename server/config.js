const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .trim();
}

// Hardcoded Platform Super-Admin Configuration
// Set ADMIN_EMAIL in .env / environment variables or use the default backend email below.
const DEFAULT_ADMIN_EMAIL = 'saip73535@gmail.com';
const SUPER_ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL) || DEFAULT_ADMIN_EMAIL;

function getSuperAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL || SUPER_ADMIN_EMAIL) || DEFAULT_ADMIN_EMAIL;
}

function isSuperAdminEmail(email) {
  const clean = normalizeEmail(email);
  return !!clean && clean === getSuperAdminEmail();
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  SUPER_ADMIN_EMAIL,
  getSuperAdminEmail,
  isSuperAdminEmail
};
