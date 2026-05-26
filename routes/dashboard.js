const express = require('express');
const router = express.Router();
const db = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

function calcDuration(started_at, ended_at) {
  if (!started_at || !ended_at) return null;
  const start = new Date(started_at);
  const end = new Date(ended_at);
  const diff = Math.floor((end - start) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}m ${secs}s`;
}

router.get('/', requireAuth, (req, res) => {
  const models = db.prepare(`
    SELECT * FROM models WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC
  `).all(req.session.userId);

  const modelsWithData = models.map(model => {
    const callTypes = db.prepare(`
      SELECT * FROM call_types WHERE model_id = ? ORDER BY sort_order ASC, created_at ASC
    `).all(model.id);

    const callTypesWithSessions = callTypes.map(ct => {
      const lastSession = db.prepare(`
        SELECT * FROM sessions_calls WHERE call_type_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(ct.id);
      const totalSessions = db.prepare(`
        SELECT COUNT(*) as count FROM sessions_calls WHERE call_type_id = ?
      `).get(ct.id);
      return {
        ...ct,
        lastSession: lastSession ? {
          ...lastSession,
          duration: calcDuration(lastSession.started_at, lastSession.ended_at)
        } : null,
        totalSessions: totalSessions.count
      };
    });

    return { ...model, callTypes: callTypesWithSessions };
  });

  const stats = {
    totalModels: models.length,
    totalCallTypes: db.prepare('SELECT COUNT(*) as count FROM call_types ct JOIN models m ON ct.model_id = m.id WHERE m.user_id = ?').get(req.session.userId).count,
    activeSessions: db.prepare('SELECT COUNT(*) as count FROM sessions_calls sc JOIN call_types ct ON sc.call_type_id = ct.id JOIN models m ON ct.model_id = m.id WHERE m.user_id = ? AND sc.status = "active"').get(req.session.userId).count
  };

  res.render('dashboard', {
    models: modelsWithData,
    stats,
    userName: req.session.userName,
    userRole: req.session.userRole,
    baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
  });
});

router.get('/model/:id/sessions', requireAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT sc.*, ct.name as call_type_name,
    CASE 
      WHEN sc.started_at IS NOT NULL AND sc.ended_at IS NOT NULL 
      THEN ROUND((julianday(sc.ended_at) - julianday(sc.started_at)) * 24 * 60, 1)
      ELSE NULL 
    END as duration_mins
    FROM sessions_calls sc
    JOIN call_types ct ON sc.call_type_id = ct.id
    WHERE ct.model_id = ?
    ORDER BY sc.created_at DESC
    LIMIT 50
  `).all(req.params.id);
  res.json(sessions);
});

router.get('/calltype/:id/sessions', requireAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT *,
    CASE 
      WHEN started_at IS NOT NULL AND ended_at IS NOT NULL 
      THEN ROUND((julianday(ended_at) - julianday(started_at)) * 24 * 60, 1)
      ELSE NULL 
    END as duration_mins
    FROM sessions_calls
    WHERE call_type_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.params.id);
  res.json(sessions);
});

module.exports = router;
