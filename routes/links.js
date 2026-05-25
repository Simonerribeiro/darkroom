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
    transformation: [{ quality: 'auto' }]
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

router.post('/create', requireAuth, upload.single('video'), (req, res) => {
  const { host_name, slug } = req.body;
  const videoUrl = req.file ? req.file.path : null;
  const videoPublicId = req.file ? req.file.filename : null;

  try {
    db.prepare(`
      INSERT INTO infinite_links (user_id, host_name, slug, video_url, video_public_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.session.userId, host_name, slug, videoUrl, videoPublicId);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Slug já existe' });
  }
});

router.post('/toggle/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM infinite_links WHERE id = ?').get(req.params.id);
  if (!link) return res.json({ success: false });
  db.prepare('UPDATE infinite_links SET active = ? WHERE id = ?').run(link.active ? 0 : 1, req.params.id);
  res.json({ success: true, active: !link.active });
});

router.delete('/delete/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM infinite_links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/share/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM infinite_links WHERE id = ?').get(req.params.id);
  if (!link || !link.active) return res.json({ success: false, error: 'Link inativo' });

  const token = uuidv4();
  db.prepare(`
    INSERT INTO sessions_calls (link_id, session_token, status)
    VALUES (?, ?, 'pending')
  `).run(link.id, token);

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ success: true, url: `${baseUrl}/go/${link.slug}/${token}` });
});

module.exports = router;
