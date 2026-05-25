const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'darkroom/videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
    eager: [{ quality: 'auto:good', fetch_format: 'mp4' }],
    eager_async: true
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

// Criar modelo
router.post('/model/create', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, error: 'Nome obrigatório' });
  try {
    const result = db.prepare(`
      INSERT INTO models (user_id, name) VALUES (?, ?)
    `).run(req.session.userId, name);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar modelo
router.post('/model/edit/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  try {
    db.prepare('UPDATE models SET name = ? WHERE id = ? AND user_id = ?')
      .run(name, req.params.id, req.session.userId);
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

// Criar tipo de chamada com vídeo
router.post('/calltype/create', requireAuth, (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      return res.json({ success: false, error: 'Erro no upload: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  try {
    const { model_id, name } = req.body;
    const videoUrl = req.file ? req.file.path : null;
    const videoPublicId = req.file ? req.file.filename : null;

    const result = db.prepare(`
      INSERT INTO call_types (model_id, name, video_url, video_public_id)
      VALUES (?, ?, ?, ?)
    `).run(model_id, name, videoUrl, videoPublicId);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar tipo de chamada
router.post('/calltype/edit/:id', requireAuth, (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) return res.json({ success: false, error: err.message });
    next();
  });
}, (req, res) => {
  try {
    const { name } = req.body;
    if (req.file) {
      db.prepare('UPDATE call_types SET name = ?, video_url = ?, video_public_id = ? WHERE id = ?')
        .run(name, req.file.path, req.file.filename, req.params.id);
    } else {
      db.prepare('UPDATE call_types SET name = ? WHERE id = ?')
        .run(name, req.params.id);
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
  if (!callType) return res.json({ success: false, error: 'Tipo de chamada inativo ou não encontrado' });

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
