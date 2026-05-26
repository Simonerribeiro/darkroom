const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

router.get('/', async (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(result.rows[0].count) === 0) return res.redirect('/setup');
    res.render('login', { error: null });
  } catch(e) {
    res.redirect('/setup');
  }
});

router.get('/setup', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(result.rows[0].count) > 0) return res.redirect('/');
    res.render('setup', { error: null });
  } catch(e) {
    res.render('setup', { error: null });
  }
});

router.post('/setup', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hash, 'admin']
    );
    req.session.userId = result.rows[0].id;
    req.session.userName = name;
    req.session.userRole = 'admin';
    res.redirect('/dashboard');
  } catch (e) {
    res.render('setup', { error: 'Email já cadastrado' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.render('login', { error: 'Credenciais inválidas' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.render('login', { error: 'Credenciais inválidas' });
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    res.redirect('/dashboard');
  } catch(e) {
    res.render('login', { error: 'Erro ao fazer login' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
