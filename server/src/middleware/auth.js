const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

/**
 * Verify the Bearer JWT and attach req.user.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, name, email, role, clinic_id, department_id FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Only allow a request when the authenticated user belongs to the clinic named
 * in the route. Admins may cross clinics; everyone else is confined to their own.
 * The approval gate is a patient-safety control, so this is enforced here rather
 * than trusting the client to send the right clinic id.
 */
function authorizeClinic(req, res, next) {
  const clinicId = req.params.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'clinic_id is required' });
  if (req.user.role !== 'admin' && req.user.clinic_id !== clinicId) {
    return res.status(403).json({ error: 'Not authorised for this clinic' });
  }
  next();
}

/**
 * Authenticate a trusted internal service (the agent worker) with a shared
 * bearer token rather than a user JWT. Used only for the agent-run callback
 * endpoints, which a human never calls directly.
 */
function requireServiceToken(req, res, next) {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'AGENT_SERVICE_TOKEN is not configured' });
  }
  const provided =
    req.headers['x-service-token'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  next();
}

/** Constant-time string comparison (length is allowed to leak). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a Socket.IO handshake token. Returns the user row or null.
 */
async function verifySocketToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, name, email, role, clinic_id FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

module.exports = { authenticate, authorizeClinic, requireServiceToken, verifySocketToken };
