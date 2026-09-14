const express = require('express');
const router = express.Router();
const { query: db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { createShortenedLink } = require('../utils/shortener');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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

// Upload com conversão automática para MP4 — funciona para MOV, MP4, WebM, qualquer formato
router.post('/presign', requireAuth, upload.single('video'), async (req, res) => {
  const tmpInput = path.join(os.tmpdir(), `input-${uuidv4()}.tmp`);
  const tmpOutput = path.join(os.tmpdir(), `output-${uuidv4()}.mp4`);
  try {
    if (!req.file) return res.json({ success: false, error: 'Nenhum arquivo enviado' });

    fs.writeFileSync(tmpInput, req.file.buffer);
    console.log('[VIDEO] Convertendo para MP4...');
    await compressVideo(tmpInput, tmpOutput);
    console.log('[VIDEO] Conversão concluída');

    const compressed = fs.readFileSync(tmpOutput);
    const key = `videos/${uuidv4()}-converted.mp4`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: compressed,
      ContentType: 'video/mp4'
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, signedUrl: null, publicUrl, key });
  } catch (e) {
    console.error('Presign/convert error:', e.message);
    res.json({ success: false, error: e.message });
  } finally {
    try { fs.unlinkSync(tmpInput); } catch(e) {}
    try { fs.unlinkSync(tmpOutput); } catch(e) {}
  }
});

router.post('/upload-video', requireAuth, upload.single('video'), async (req, res) => {
  const tmpInput = path.join(os.tmpdir(), `input-${uuidv4()}.mp4`);
  const tmpOutput = path.join(os.tmpdir(), `output-${uuidv4()}.mp4`);
  try {
    if (!req.file) return res.json({ success: false, error: 'Nenhum arquivo enviado' });
    fs.writeFileSync(tmpInput, req.file.buffer);
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

router.post('/model/create', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, error: 'Nome obrigatorio' });
  try {
    const result = await db(
      'INSERT INTO models (user_id, name) VALUES ($1, $2) RETURNING id',
      [req.session.userId, name]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.post('/model/edit/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  try {
    await db(
      'UPDATE models SET name = $1 WHERE id = $2 AND user_id = $3',
      [name, req.params.id, req.session.userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.delete('/model/delete/:id', requireAuth, async (req, res) => {
  try {
    const callTypes = await db(
      'SELECT id FROM call_types WHERE model_id = $1',
      [req.params.id]
    );
    for (const ct of callTypes.rows) {
      await db('DELETE FROM sessions_calls WHERE call_type_id = $1', [ct.id]);
    }
    await db('DELETE FROM call_types WHERE model_id = $1', [req.params.id]);
    await db('DELETE FROM models WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.post('/calltype/create', requireAuth, async (req, res) => {
  try {
    const { model_id, name, video_url, video_public_id } = req.body;
    if (!model_id || !name) return res.json({ success: false, error: 'Campos obrigatorios' });
    const result = await db(
      'INSERT INTO call_types (model_id, name, video_url, video_public_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [model_id, name, video_url || null, video_public_id || null]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.post('/calltype/edit/:id', requireAuth, async (req, res) => {
  try {
    const { name, video_url, video_public_id } = req.body;
    if (video_url) {
      await db(
        'UPDATE call_types SET name = $1, video_url = $2, video_public_id = $3 WHERE id = $4',
        [name, video_url, video_public_id, req.params.id]
      );
    } else {
      await db('UPDATE call_types SET name = $1 WHERE id = $2', [name, req.params.id]);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.delete('/calltype/delete/:id', requireAuth, async (req, res) => {
  try {
    await db('DELETE FROM sessions_calls WHERE call_type_id = $1', [req.params.id]);
    await db('DELETE FROM call_types WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.post('/share/:callTypeId', requireAuth, async (req, res) => {
  try {
    const callTypeResult = await db(
      'SELECT * FROM call_types WHERE id = $1 AND active = 1',
      [req.params.callTypeId]
    );
    const callType = callTypeResult.rows[0];
    if (!callType) return res.json({ success: false, error: 'Tipo de chamada inativo' });

    const token = uuidv4();
    const sessionResult = await db(
      "INSERT INTO sessions_calls (call_type_id, session_token, status) VALUES ($1, $2, 'pending') RETURNING id",
      [callType.id, token]
    );
    const sessionId = sessionResult.rows[0].id;

    // Criar link encurtado
    const shortCode = await createShortenedLink(sessionId);

    const modelResult = await db('SELECT * FROM models WHERE id = $1', [callType.model_id]);
    const model = modelResult.rows[0];
    let baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    // Garantir que sempre tenha https://
    if (!baseUrl.includes('://')) {
      baseUrl = `https://${baseUrl}`;
    }

    // Retornar URL encurtada ao invés da URL longa
    res.json({ success: true, url: `${baseUrl}/s/${shortCode}`, token });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Cancela uma sessão pendente (link gerado que o lead nunca abriu).
// Não deleta a linha do banco: apenas marca status='cancelled', preservando o histórico.
router.post('/session/:id/cancel', requireAuth, async (req, res) => {
  try {
    const result = await db(
      `UPDATE sessions_calls
       SET status = 'cancelled', ended_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND status = 'pending'
         AND call_type_id IN (
           SELECT ct.id FROM call_types ct
           JOIN models m ON ct.model_id = m.id
           WHERE m.user_id = $2
         )
       RETURNING call_type_id`,
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Sessão não encontrada ou já em andamento/finalizada' });
    }
    const io = req.app.get('io');
    if (io) io.to('dashboard').emit('session-changed', { callTypeId: result.rows[0].call_type_id });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;
