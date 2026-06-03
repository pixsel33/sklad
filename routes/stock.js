const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('./auth');

// GET /api/stock
router.get('/', auth, (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM stock';
  const params = [];
  if (category) { sql += ' WHERE category = ?'; params.push(category); }
  sql += ' ORDER BY name ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/stock/categories
router.get('/categories', auth, (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM stock WHERE category IS NOT NULL').all();
  res.json(cats.map(c => c.category));
});

module.exports = router;
