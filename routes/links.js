const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

// Gerar URL assinada para upload direto ao R2
router.post('/presign', requireAuth, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    const key = `videos/${uuidv4()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType
    });

    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: 3600,
      unhoistableHeaders: new Set(['content-type'])
    });

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, signedUrl, publicUrl, key });
  } catch (e) {
    console.error('Presign error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// Criar modelo
router.post('/model/create', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, error: 'Nome obrigatorio' });
  try {
    const result = db.prepare('INSERT INTO models (user_id, name) VALUES (?, ?)').run(req.session.userId, name);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar modelo
router.post('/model/edit/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  try {
    db.prepare('UPDATE models SET name = ? WHERE id = ? AND user_id = ?').run(name, req.params.id, req.session.userId);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Deletar modelo
router.delete('/model/delete/:id', requireAuth, (req, res) => {
  try {
    const callTypes = db.prepare('SELECT id FROM call_types WHERE model_id = ?').all(req.params.id);
    callTypes.forEach(ct => {
      db.prepare('DELETE FROM sessions_calls WHERE call_type_id = ?').run(ct.id);
    });
    db.prepare('DELETE FROM call_types WHERE model_id = ?').run(req.params.id);
    db.prepare('DELETE FROM models WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Criar tipo de chamada
router.post('/calltype/create', requireAuth, (req, res) => {
  try {
    const { model_id, name, video_url, video_public_id } = req.body;
    if (!model_id || !name) return res.json({ success: false, error: 'Campos obrigatorios' });
    const result = db.prepare(`
      INSERT INTO call_types (model_id, name, video_url, video_public_id)
      VALUES (?, ?, ?, ?)
    `).run(model_id, name, video_url || null, video_public_id || null);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar tipo de chamada
router.post('/calltype/edit/:id', requireAuth, (req, res) => {
  try {
    const { name, video_url, video_public_id } = req.body;
    if (video_url) {
      db.prepare('UPDATE call_types SET name = ?, video_url = ?, video_public_id = ? WHERE id = ?')
        .run(name, video_url, video_public_id, req.params.id);
    } else {
      db.prepare('UPDATE call_types SET name = ? WHERE id = ?').run(name, req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Deletar tipo de chamada
router.delete('/calltype/delete/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM sessions_calls WHERE call_type_id = ?').run(req.params.id);
    db.prepare('DELETE FROM call_types WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Gerar link de compartilhamento
router.post('/share/:callTypeId', requireAuth, (req, res) => {
  const callType = db.prepare('SELECT * FROM call_types WHERE id = ? AND active = 1').get(req.params.callTypeId);
  if (!callType) return res.json({ success: false, error: 'Tipo de chamada inativo' });

  const token = uuidv4();
  db.prepare(`
    INSERT INTO sessions_calls (call_type_id, session_token, status)
    VALUES (?, ?, 'pending')
  `).run(callType.id, token);

  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(callType.model_id);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const slug = `${model.id}-${callType.id}`;

  res.json({ success: true, url: `${baseUrl}/go/${slug}/${token}`, token });
});

module.exports = router;
