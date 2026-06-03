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

  // Перечисления идут в отдельный счёт, остальное в кассу
  if (source === 'Перечисления') {
    db.prepare('UPDATE perechisleniya SET balance = balance + ? WHERE id = 1').run(amount);
  } else {
    db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(amount);
  }

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

// DELETE /api/ops/:id — универсальное удаление
router.delete('/:id', auth, (req, res) => {
  const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(req.params.id);
  if (!op) return res.status(404).json({ error: 'Операция не найдена' });

  if (op.type === 'sale') {
    db.prepare('UPDATE stock SET qty = qty + ?, updated_at = unixepoch() WHERE name = ?').run(op.qty, op.name);
    db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(op.total);
  }
  if (op.type === 'income-money') {
    if (op.source === 'Перечисления') {
      db.prepare('UPDATE perechisleniya SET balance = balance - ? WHERE id = 1').run(op.amount);
    } else {
      db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(op.amount);
    }
  }
  if (op.type === 'expense') {
    db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(op.amount);
  }
  if (op.type === 'income-goods') {
    db.prepare('UPDATE stock SET qty = qty - ?, updated_at = unixepoch() WHERE name = ?').run(op.qty, op.name);
  }

  db.prepare('DELETE FROM operations WHERE id = ?').run(op.id);
  res.json({ message: 'Операция удалена' });
});

// PUT /api/ops/:id — универсальное изменение
router.put('/:id', auth, (req, res) => {
  const old = db.prepare('SELECT * FROM operations WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Операция не найдена' });

  // ── Продажа ──
  if (old.type === 'sale') {
    const { qty, price, paytype, client } = req.body;
    const newQty = parseFloat(qty) || old.qty;
    const newPrice = parseFloat(price) || old.price;
    const newTotal = newQty * newPrice;
    const diffQty = newQty - old.qty;
    if (diffQty > 0) {
      const item = db.prepare('SELECT qty FROM stock WHERE name = ?').get(old.name);
      if (!item || item.qty < diffQty) return res.status(400).json({ error: 'Недостаточно товара на складе' });
    }
    const item = db.prepare('SELECT buy_price FROM stock WHERE name = ?').get(old.name);
    const newProfit = (newPrice - (item ? item.buy_price : 0)) * newQty;
    db.prepare('UPDATE stock SET qty = qty + ?, updated_at = unixepoch() WHERE name = ?').run(old.qty, old.name);
    db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(old.total);
    db.prepare('UPDATE stock SET qty = qty - ?, updated_at = unixepoch() WHERE name = ?').run(newQty, old.name);
    db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(newTotal);
    db.prepare('UPDATE operations SET qty=?, price=?, total=?, profit=?, paytype=?, client=? WHERE id=?')
      .run(newQty, newPrice, newTotal, newProfit, paytype || old.paytype, client !== undefined ? client : old.client, old.id);
    return res.json({ message: 'Продажа обновлена' });
  }

  // ── Приход денег ──
  if (old.type === 'income-money') {
    const { amount, source, note } = req.body;
    const newSource = source !== undefined ? source : old.source;
    const newAmount = parseFloat(amount) || old.amount;
    // Откат старого
    if (old.source === 'Перечисления') {
      db.prepare('UPDATE perechisleniya SET balance = balance - ? WHERE id = 1').run(old.amount);
    } else {
      db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(old.amount);
    }
    // Применить новое
    if (newSource === 'Перечисления') {
      db.prepare('UPDATE perechisleniya SET balance = balance + ? WHERE id = 1').run(newAmount);
    } else {
      db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(newAmount);
    }
    db.prepare('UPDATE operations SET amount=?, source=?, note=? WHERE id=?')
      .run(newAmount, newSource, note !== undefined ? note : old.note, old.id);
    return res.json({ message: 'Приход денег обновлён' });
  }

  // ── Расход ──
  if (old.type === 'expense') {
    const { amount, category, description } = req.body;
    const newAmount = parseFloat(amount) || old.amount;
    const diff = newAmount - old.amount;
    const cash = db.prepare('SELECT balance FROM cash WHERE id = 1').get();
    if (diff > 0 && cash.balance < diff) return res.status(400).json({ error: 'Недостаточно средств в кассе' });
    db.prepare('UPDATE cash SET balance = balance + ? WHERE id = 1').run(old.amount);
    db.prepare('UPDATE cash SET balance = balance - ? WHERE id = 1').run(newAmount);
    db.prepare('UPDATE operations SET amount=?, category=?, description=? WHERE id=?')
      .run(newAmount, category || old.category, description !== undefined ? description : old.description, old.id);
    return res.json({ message: 'Расход обновлён' });
  }

  // ── Приход товара ──
  if (old.type === 'income-goods') {
    const { qty, price, note } = req.body;
    const newQty = parseFloat(qty) || old.qty;
    const newPrice = parseFloat(price) || old.price;
    const newTotal = newQty * newPrice;
    db.prepare('UPDATE stock SET qty = qty - ?, updated_at = unixepoch() WHERE name = ?').run(old.qty, old.name);
    db.prepare('UPDATE stock SET qty = qty + ?, buy_price = ?, updated_at = unixepoch() WHERE name = ?').run(newQty, newPrice, old.name);
    db.prepare('UPDATE operations SET qty=?, price=?, total=?, note=? WHERE id=?')
      .run(newQty, newPrice, newTotal, note !== undefined ? note : old.note, old.id);
    return res.json({ message: 'Приход товара обновлён' });
  }

  res.status(400).json({ error: 'Неизвестный тип операции' });
});

// GET /api/ops/stats — dashboard stats
router.get('/stats', auth, (req, res) => {
  const cash = db.prepare('SELECT balance FROM cash WHERE id = 1').get();
  const perechisleniya = db.prepare('SELECT balance FROM perechisleniya WHERE id = 1').get();

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTs = Math.floor(todayStart.getTime() / 1000);

  const salesToday = db.prepare(`SELECT COALESCE(SUM(total),0) as sum, COUNT(*) as cnt FROM operations WHERE type='sale' AND created_at >= ?`).get(todayTs);
  const expenseToday = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum FROM operations WHERE type='expense' AND created_at >= ?`).get(todayTs);
  const stockTotal = db.prepare('SELECT COALESCE(SUM(qty),0) as qty, COUNT(*) as cats FROM stock').get();

  const karzSales = db.prepare(`SELECT COALESCE(SUM(total),0) as sum FROM operations WHERE type='sale' AND paytype='Карз'`).get();
  const karzPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum FROM operations WHERE type='income-money' AND source='Карз'`).get();
  const debts = Math.max(0, karzSales.sum - karzPaid.sum);

  res.json({
    cash: cash.balance,
    perechisleniya: perechisleniya.balance,
    stockQty: stockTotal.qty,
    stockCats: stockTotal.cats,
    salesToday: salesToday.sum,
    salesCnt: salesToday.cnt,
    expenseToday: expenseToday.sum,
    debts
  });
});

module.exports = router;
