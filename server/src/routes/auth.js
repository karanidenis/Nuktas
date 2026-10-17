const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = lower($1) AND is_active = true',
    [email]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clinic_id: user.clinic_id,
    },
  });
}));

// POST /api/auth/logout
router.post('/logout', authenticate, (_req, res) => {
  // JWT is stateless; client discards the token
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      clinic_id: u.clinic_id,
    },
  });
});

module.exports = router;
