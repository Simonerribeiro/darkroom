const express = require('express');
const router = express.Router();
const db = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.session.userRole === 'admin';

  let links;
  if (isAdmin) {
    links = db.prepare(`
      SELECT il.*, u.name as user_name,
        COUNT(sc.id) as total_convs,
        SUM(CASE WHEN sc.status = 'active' THEN 1 ELSE 0 END) as active_convs
      FROM infinite_links il
      LEFT JOIN users u ON il.user_id = u.id
      LEFT JOIN sessions_calls sc ON sc.link_id = il.id
      GROUP BY il.id
      ORDER BY il.created_at DESC
    `).all();
  } else {
    links = db.prepare(`
      SELECT il.*,
        COUNT(sc.id) as total_convs,
        SUM(CASE WHEN sc.status = 'active' THEN 1 ELSE 0 END) as active_convs
      FROM infinite_links il
      LEFT JOIN sessions_calls sc ON sc.link_id = il.id
      WHERE il.user_id = ?
      GROUP BY il.id
      ORDER BY il.created_at DESC
    `).all(req.session.userId);
  }

  const stats = {
    activeLinks: links.filter(l => l.active).length,
    totalConvs: links.reduce((a, l) => a + (l.total_convs || 0), 0),
    activeConvs: links.reduce((a, l) => a + (l.active_convs || 0), 0)
  };

  res.render('dashboard', {
    links,
    stats,
    userName: req.session.userName,
    userRole: req.session.userRole,
    baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
  });
});

router.get('/link/:id/sessions', requireAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT * FROM sessions_calls WHERE link_id = ? ORDER BY created_at DESC
  `).all(req.params.id);
  res.json(sessions);
});

module.exports = router;
