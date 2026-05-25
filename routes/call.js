const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/:slug/:token', (req, res) => {
  const { slug, token } = req.params;
  const parts = slug.split('-');
  const modelId = parts[0];
  const callTypeId = parts[1];

  const callType = db.prepare('SELECT * FROM call_types WHERE id = ? AND active = 1').get(callTypeId);
  if (!callType) return res.render('call-blocked', { reason: 'not_found' });

  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId);
  if (!model) return res.render('call-blocked', { reason: 'not_found' });

  const session = db.prepare('SELECT * FROM sessions_calls WHERE session_token = ? AND call_type_id = ?').get(token, callTypeId);
  if (!session) return res.render('call-blocked', { reason: 'not_found' });
  if (session.status === 'ended') return res.render('call-blocked', { reason: 'ended' });

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  res.render('call-incoming', {
    link: { host_name: model.name, slug, video_url: callType.video_url },
    session,
    baseUrl,
    token
  });
});

router.post('/:slug/:token/accept', (req, res) => {
  const { slug, token } = req.params;
  const parts = slug.split('-');
  const callTypeId = parts[1];

  const session = db.prepare('SELECT * FROM sessions_calls WHERE session_token = ? AND call_type_id = ?').get(token, callTypeId);
  if (!session || session.status === 'ended') return res.json({ success: false, blocked: true });

  const callType = db.prepare('SELECT * FROM call_types WHERE id = ?').get(callTypeId);
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(parts[0]);

  db.prepare("UPDATE sessions_calls SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE session_token = ?").run(token);

  res.json({
    success: true,
    videoUrl: callType.video_url,
    hostName: model.name
  });
});

router.post('/:slug/:token/end', (req, res) => {
  const { token } = req.params;
  db.prepare("UPDATE sessions_calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE session_token = ?").run(token);
  res.json({ success: true });
});

module.exports = router;
