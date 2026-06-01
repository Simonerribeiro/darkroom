const express = require('express');
const router = express.Router();
const db = require('../db/database');

// ── Rota de preview para WhatsApp ──────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const token = req.query.t;
  const parts = slug.split('-');
  const modelId = parts[0];

  try {
    const modelResult = await db.query('SELECT * FROM models WHERE id = $1', [modelId]);
    const model = modelResult.rows[0];
    if (!model) return res.render('call-blocked', { reason: 'not_found' });

    if (token) {
      return res.redirect(`/go/${slug}/${token}`);
    }

    const hostName = model.name;
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="${hostName} está te esperando">
  <meta property="og:description" content="A participante está na conversa te esperando, acesse agora">
  <meta property="og:site_name" content="${process.env.BASE_URL || 'darkroom'}">
  <meta property="og:type" content="website">
</head>
<body></body>
</html>`);
  } catch (e) {
    console.error('Preview error:', e);
    res.render('call-blocked', { reason: 'not_found' });
  }
});

// ── Rota principal da chamada ──────────────────────────────────────────────
router.get('/:slug/:token', async (req, res) => {
  const { slug, token } = req.params;
  const parts = slug.split('-');
  const modelId = parts[0];
  const callTypeId = parts[1];
  try {
    const callTypeResult = await db.query(
      'SELECT * FROM call_types WHERE id = $1 AND active = 1',
      [callTypeId]
    );
    const callType = callTypeResult.rows[0];
    if (!callType) return res.render('call-blocked', { reason: 'not_found' });

    const modelResult = await db.query('SELECT * FROM models WHERE id = $1', [modelId]);
    const model = modelResult.rows[0];
    if (!model) return res.render('call-blocked', { reason: 'not_found' });

    const sessionResult = await db.query(
      'SELECT * FROM sessions_calls WHERE session_token = $1 AND call_type_id = $2',
      [token, callTypeId]
    );
    const session = sessionResult.rows[0];
    if (!session) return res.render('call-blocked', { reason: 'not_found' });
    if (session.status === 'ended') return res.render('call-blocked', { reason: 'ended' });

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.render('call-incoming', {
      link: { host_name: model.name, slug, video_url: callType.video_url },
      session,
      baseUrl,
      token
    });
  } catch (e) {
    console.error('Call error:', e);
    res.render('call-blocked', { reason: 'not_found' });
  }
});

// ── Accept ─────────────────────────────────────────────────────────────────
router.post('/:slug/:token/accept', async (req, res) => {
  const { slug, token } = req.params;
  const parts = slug.split('-');
  const callTypeId = parts[1];
  try {
    const sessionResult = await db.query(
      'SELECT * FROM sessions_calls WHERE session_token = $1 AND call_type_id = $2',
      [token, callTypeId]
    );
    const session = sessionResult.rows[0];
    if (!session || session.status === 'ended') return res.json({ success: false, blocked: true });

    const callTypeResult = await db.query('SELECT * FROM call_types WHERE id = $1', [callTypeId]);
    const callType = callTypeResult.rows[0];

    const modelResult = await db.query('SELECT * FROM models WHERE id = $1', [parts[0]]);
    const model = modelResult.rows[0];

    await db.query(
      "UPDATE sessions_calls SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE session_token = $1",
      [token]
    );
    res.json({ success: true, videoUrl: callType.video_url, hostName: model.name });
  } catch (e) {
    res.json({ success: false, blocked: true });
  }
});

// ── End ────────────────────────────────────────────────────────────────────
router.post('/:slug/:token/end', async (req, res) => {
  const { token } = req.params;
  try {
    await db.query(
      "UPDATE sessions_calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE session_token = $1",
      [token]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

module.exports = router;
