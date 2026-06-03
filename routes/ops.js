const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('./auth');

// GET /api/ops — all operations
router.get('/', auth, (req, res) => {
  const { type, limit = 100 } = req.query;
  let sql = 'SELECT * FROM operations';
  const params = [];
  if (type && type !== 'all') { sql += ' WHERE type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  const ops = db.prepare(sql).all(...params);
  res.json(ops);
});

// POST /api/ops/income-goods — приход товара
router.post('/income-goods', auth, (req, res) => {
  const { name, category, unit, qty, price, note } = req.body;
  if (!name || !qty) return res.status(400).json({ error: 'Заполните обязательные поля' });

  const total = (qty || 0) * (price || 0);

  // Update stock
  const existing = db.prepare('SELECT * FROM stock WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE stock SET qty = qty + ?, buy_price = ?, category = ?, unit = ?, updated_at = unixepoch() WHERE name = ?')
      .run(qty, price || 0, category || existing.category, unit || existing.unit, name);
  } else {
    db.prepare('INSERT INTO stock (name, category, unit, qty, buy_price) VALUES (?, ?, ?, ?, ?)')
      .run(name, category || 'Уголь', unit || 'тонна', qty, price || 0);
  }

  // Record operation
  const op = db.prepare(`INSERT INTO operations (type, name, category, unit, qty, price, total, note, user_login)
    VALUES ('income-goods', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, category || 'Уголь', unit || 'тонна', qty, price || 0, total, note || '', req.user.login);

  res.json({ id: op.lastInsertRowid, message: 'Приход добавлен' });
});

// POST /api/ops/income-money — приход денег
router.post('/income-money', auth, (req, res) => {
  const { amount, source, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Укажите сумму' });

  db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(amount);

  const op = db.prepare(`INSERT INTO operations (type, amount, source, note, user_login)
    VALUES ('income-money', ?, ?, ?, ?)`)
    .run(amount, source || '', note || '', req.user.login);

  res.json({ id: op.lastInsertRowid, message: 'Приход денег записан' });
});

// POST /api/ops/expense — расход
router.post('/expense', auth, (req, res) => {
  const { amount, category, description } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Укажите сумму' });

  const cash = db.prepare('SELECT balance FROM cash WHERE id = 1').get();
  if (cash.balance < amount) return res.status(400).json({ error: 'Недостаточно средств в кассе' });

  db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(amount);

  const op = db.prepare(`INSERT INTO operations (type, amount, category, description, user_login)
    VALUES ('expense', ?, ?, ?, ?)`)
    .run(amount, category || '', description || '', req.user.login);

  res.json({ id: op.lastInsertRowid, message: 'Расход записан' });
});

// POST /api/ops/sale — продажа
router.post('/sale', auth, (req, res) => {
  const { name, qty, price, paytype, client } = req.body;
  if (!name || !qty || !price) return res.status(400).json({ error: 'Заполните все поля' });

  const item = db.prepare('SELECT * FROM stock WHERE name = ?').get(name);
  if (!item) return res.status(400).json({ error: 'Товар не найден' });
  if (item.qty < qty) return res.status(400).json({ error: 'Недостаточно товара на складе' });

  const total = qty * price;
  const profit = (price - item.buy_price) * qty;

  db.prepare('UPDATE stock SET qty = qty - ?, updated_at = unixepoch() WHERE name = ?').run(qty, name);
  db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(total);

  const op = db.prepare(`INSERT INTO operations (type, name, qty, price, total, profit, paytype, client, user_login)
    VALUES ('sale', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, qty, price, total, profit, paytype || 'Нахт', client || '', req.user.login);

  res.json({ id: op.lastInsertRowid, message: 'Продажа оформлена', total, profit });
});

// GET /api/ops/stats — dashboard stats
router.get('/stats', auth, (req, res) => {
  const cash = db.prepare('SELECT balance FROM cash WHERE id = 1').get();

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTs = Math.floor(todayStart.getTime() / 1000);

  const salesToday = db.prepare(`SELECT COALESCE(SUM(total),0) as sum, COUNT(*) as cnt FROM operations WHERE type='sale' AND created_at >= ?`).get(todayTs);
  const expenseToday = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum FROM operations WHERE type='expense' AND created_at >= ?`).get(todayTs);

  const stockTotal = db.prepare('SELECT COALESCE(SUM(qty),0) as qty, COUNT(*) as cats FROM stock').get();

  // Долги: продажи Карз - возвраты Карз
  const karzSales = db.prepare(`SELECT COALESCE(SUM(total),0) as sum FROM operations WHERE type='sale' AND paytype='Карз'`).get();
  const karzPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum FROM operations WHERE type='income-money' AND source='Карз'`).get();
  const debts = Math.max(0, karzSales.sum - karzPaid.sum);

  res.json({
    cash: cash.balance,
    stockQty: stockTotal.qty,
    stockCats: stockTotal.cats,
    salesToday: salesToday.sum,
    salesCnt: salesToday.cnt,
    expenseToday: expenseToday.sum,
    debts
  });
});

module.exports = router;
