const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth } = require('./auth');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
  next();
}

// GET /api/users
router.get('/', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, login, name, role, created_at FROM users ORDER BY id').all();
  res.json(users);
});

// POST /api/users
router.post('/', auth, adminOnly, (req, res) => {
  const { login, password, name, role } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Заполните логин и пароль' });
  const exists = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
  if (exists) return res.status(400).json({ error: 'Логин уже занят' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (login, password, name, role) VALUES (?, ?, ?, ?)')
    .run(login, hash, name || login, role || 'cashier');
  res.json({ id: result.lastInsertRowid, message: 'Пользователь создан' });
});

// DELETE /api/users/:id
router.delete('/:id', auth, adminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.login === 'admin') return res.status(400).json({ error: 'Нельзя удалить главного админа' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Пользователь удалён' });
});

module.exports = router;
