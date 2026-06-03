const express = require('express');
const router = express.Router();
const { query: db } = require('../db/database');

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

router.get('/', requireAuth, async (req, res) => {
  try {
    const modelsResult = await db(
      'SELECT * FROM models WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [req.session.userId]
    );
    const models = modelsResult.rows;

    const modelsWithData = await Promise.all(models.map(async (model) => {
      const callTypesResult = await db(
        'SELECT * FROM call_types WHERE model_id = $1 ORDER BY sort_order ASC, created_at ASC',
        [model.id]
      );
      const callTypes = callTypesResult.rows;

      const callTypesWithSessions = await Promise.all(callTypes.map(async (ct) => {
        const lastSessionResult = await db(
          'SELECT * FROM sessions_calls WHERE call_type_id = $1 ORDER BY created_at DESC LIMIT 1',
          [ct.id]
        );
        const totalSessionsResult = await db(
          'SELECT COUNT(*) as count FROM sessions_calls WHERE call_type_id = $1',
          [ct.id]
        );
        const lastSession = lastSessionResult.rows[0];
        return {
          ...ct,
          lastSession: lastSession ? {
            ...lastSession,
            duration: calcDuration(lastSession.started_at, lastSession.ended_at)
          } : null,
          totalSessions: parseInt(totalSessionsResult.rows[0].count)
        };
      }));

      return { ...model, callTypes: callTypesWithSessions };
    }));

    const totalCallTypesResult = await db(
      `SELECT COUNT(*) as count FROM call_types ct
       JOIN models m ON ct.model_id = m.id
       WHERE m.user_id = $1`,
      [req.session.userId]
    );

    const activeSessionsResult = await db(
      `SELECT COUNT(*) as count FROM sessions_calls sc
       JOIN call_types ct ON sc.call_type_id = ct.id
       JOIN models m ON ct.model_id = m.id
       WHERE m.user_id = $1 AND sc.status = 'active'`,
      [req.session.userId]
    );

    const stats = {
      totalModels: models.length,
      totalCallTypes: parseInt(totalCallTypesResult.rows[0].count),
      activeSessions: parseInt(activeSessionsResult.rows[0].count)
    };

    res.render('dashboard', {
      models: modelsWithData,
      stats,
      userName: req.session.userName,
      userRole: req.session.userRole,
      baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    });
  } catch(e) {
    console.error('Dashboard error:', e);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/model/:id/sessions', requireAuth, async (req, res) => {
  try {
    const result = await db(
      `SELECT sc.*, ct.name as call_type_name,
       CASE
         WHEN sc.started_at IS NOT NULL AND sc.ended_at IS NOT NULL
         THEN ROUND(EXTRACT(EPOCH FROM (sc.ended_at - sc.started_at)) / 60, 1)
         ELSE NULL
       END as duration_mins
       FROM sessions_calls sc
       JOIN call_types ct ON sc.call_type_id = ct.id
       WHERE ct.model_id = $1
       ORDER BY sc.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch(e) {
    res.json([]);
  }
});

router.get('/calltype/:id/sessions', requireAuth, async (req, res) => {
  try {
    const result = await db(
      `SELECT *,
       CASE
         WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
         THEN ROUND(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60, 1)
         ELSE NULL
       END as duration_mins
       FROM sessions_calls
       WHERE call_type_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch(e) {
    res.json([]);
  }
});

module.exports = router;
