const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/:slug/:token', (req, res) => {
  const { slug, token } = req.params;

  const link = db.prepare('SELECT * FROM infinite_links WHERE slug = ? AND active = 1').get(slug);
  if (!link) return res.render('call-blocked', { reason: 'not_found' });

  const session = db.prepare('SELECT * FROM sessions_calls WHERE session_token = ? AND link_id = ?').get(token, link.id);
  if (!session) return res.render('call-blocked', { reason: 'not_found' });

  if (session.status === 'ended') return res.render('call-blocked', { reason: 'ended' });

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  res.render('call-incoming', {
    link,
    session,
    baseUrl,
    token
  });
});

router.post('/:slug/:token/accept', (req, res) => {
  const { slug, token } = req.params;
  const link = db.prepare('SELECT * FROM infinite_links WHERE slug = ? AND active = 1').get(slug);
  if (!link) return res.json({ success: false });

  const session = db.prepare('SELECT * FROM sessions_calls WHERE session_token = ? AND link_id = ?').get(token, link.id);
  if (!session || session.status === 'ended') return res.json({ success: false, blocked: true });

  db.prepare("UPDATE sessions_calls SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE session_token = ?").run(token);
  res.json({ success: true, videoUrl: link.video_url, hostName: link.host_name });
});

router.post('/:slug/:token/end', (req, res) => {
  const { token } = req.params;
  db.prepare("UPDATE sessions_calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE session_token = ?").run(token);
  res.json({ success: true });
});

module.exports = router;
