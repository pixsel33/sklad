const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'skladpro_secret_2024';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Заполните все поля' });

  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль' });

  const token = jwt.sign(
    { id: user.id, login: user.login, name: user.name, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: user.id, login: user.login, name: user.name, role: user.role } });
});

// Middleware — verify token
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Нет токена' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
}

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
module.exports.auth = auth;
module.exports.SECRET = SECRET;
