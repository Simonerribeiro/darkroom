const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

router.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  const setup = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (setup.count === 0) return res.redirect('/setup');
  res.render('login', { error: null });
});

router.get('/setup', (req, res) => {
  const setup = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (setup.count > 0) return res.redirect('/');
  res.render('setup', { error: null });
});

router.post('/setup', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, email, hash, 'admin');
    req.session.userId = result.lastInsertRowid;
    req.session.userName = name;
    req.session.userRole = 'admin';
    res.redirect('/dashboard');
  } catch (e) {
    res.render('setup', { error: 'Email já cadastrado' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.render('login', { error: 'Credenciais inválidas' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.render('login', { error: 'Credenciais inválidas' });
  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.userRole = user.role;
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
