const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegStatic);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 600 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

// Comprime vídeo para H.264 + AAC com faststart (~10-15MB)
function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf 28',
        '-preset fast',
        '-movflags +faststart',
        '-vf scale=720:-2',
        '-maxrate 1500k',
        '-bufsize 3000k'
      ])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

// Gera URL assinada para upload direto do browser para o R2
router.post('/presign', requireAuth, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.json({ success: false, error: 'filename e contentType obrigatorios' });
    }
    const key = `videos/${uuidv4()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, signedUrl, publicUrl, key });
  } catch (e) {
    console.error('Presign error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// Upload de vídeo com compressão automática
router.post('/upload-video', requireAuth, upload.single('video'), async (req, res) => {
  const tmpInput = path.join(os.tmpdir(), `input-${uuidv4()}.mp4`);
  const tmpOutput = path.join(os.tmpdir(), `output-${uuidv4()}.mp4`);
  try {
    if (!req.file) return res.json({ success: false, error: 'Nenhum arquivo enviado' });

    // Salva o arquivo original em temp
    fs.writeFileSync(tmpInput, req.file.buffer);

    // Comprime
    console.log('[VIDEO] Comprimindo vídeo...');
    await compressVideo(tmpInput, tmpOutput);
    console.log('[VIDEO] Compressão concluída');

    const compressed = fs.readFileSync(tmpOutput);
    const key = `videos/${uuidv4()}-compressed.mp4`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: compressed,
      ContentType: 'video/mp4'
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, url: publicUrl, key });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.json({ success: false, error: e.message });
  } finally {
    try { fs.unlinkSync(tmpInput); } catch(e) {}
    try { fs.unlinkSync(tmpOutput); } catch(e) {}
  }
});

// Criar modelo
router.post('/model/create', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, error: 'Nome obrigatorio' });
  try {
    const result = await db.query(
      'INSERT INTO models (user_id, name) VALUES ($1, $2) RETURNING id',
      [req.session.userId, name]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar modelo
router.post('/model/edit/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  try {
    await db.query(
      'UPDATE models SET name = $1 WHERE id = $2 AND user_id = $3',
      [name, req.params.id, req.session.userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Deletar modelo
router.delete('/model/delete/:id', requireAuth, async (req, res) => {
  try {
    const callTypes = await db.query(
      'SELECT id FROM call_types WHERE model_id = $1',
      [req.params.id]
    );
    for (const ct of callTypes.rows) {
      await db.query('DELETE FROM sessions_calls WHERE call_type_id = $1', [ct.id]);
    }
    await db.query('DELETE FROM call_types WHERE model_id = $1', [req.params.id]);
    await db.query('DELETE FROM models WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Criar tipo de chamada
router.post('/calltype/create', requireAuth, async (req, res) => {
  try {
    const { model_id, name, video_url, video_public_id } = req.body;
    if (!model_id || !name) return res.json({ success: false, error: 'Campos obrigatorios' });
    const result = await db.query(
      'INSERT INTO call_types (model_id, name, video_url, video_public_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [model_id, name, video_url || null, video_public_id || null]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Editar tipo de chamada
router.post('/calltype/edit/:id', requireAuth, async (req, res) => {
  try {
    const { name, video_url, video_public_id } = req.body;
    if (video_url) {
      await db.query(
        'UPDATE call_types SET name = $1, video_url = $2, video_public_id = $3 WHERE id = $4',
        [name, video_url, video_public_id, req.params.id]
      );
    } else {
      await db.query('UPDATE call_types SET name = $1 WHERE id = $2', [name, req.params.id]);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Deletar tipo de chamada
router.delete('/calltype/delete/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM sessions_calls WHERE call_type_id = $1', [req.params.id]);
    await db.query('DELETE FROM call_types WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Gerar link de compartilhamento
router.post('/share/:callTypeId', requireAuth, async (req, res) => {
  try {
    const callTypeResult = await db.query(
      'SELECT * FROM call_types WHERE id = $1 AND active = 1',
      [req.params.callTypeId]
    );
    const callType = callTypeResult.rows[0];
    if (!callType) return res.json({ success: false, error: 'Tipo de chamada inativo' });

    const token = uuidv4();
    await db.query(
      "INSERT INTO sessions_calls (call_type_id, session_token, status) VALUES ($1, $2, 'pending')",
      [callType.id, token]
    );

    const modelResult = await db.query('SELECT * FROM models WHERE id = $1', [callType.model_id]);
    const model = modelResult.rows[0];
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const slug = `${model.id}-${callType.id}`;

    res.json({ success: true, url: `${baseUrl}/go/${slug}/${token}`, token });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;
