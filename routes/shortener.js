const express = require('express');
const router = express.Router();
const { resolveShortenedLink } = require('../utils/shortener');

/**
 * Rota para redirecionamento de links encurtados
 * GET /s/:shortCode → redireciona para /go/:slug/:token
 */
router.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    // Resolver o código encurtado para obter o token real
    const linkData = await resolveShortenedLink(shortCode);

    if (!linkData) {
      return res.status(404).render('error', {
        message: 'Link expirado ou inválido',
        detail: 'Este link de chamada não foi encontrado ou expirou.'
      });
    }

    const { session_token, call_type_id } = linkData;

    // Redirecionar para a URL real
    const { query: db } = require('../db/database');
    const ctResult = await db('SELECT model_id FROM call_types WHERE id = $1', [call_type_id]);
    if (ctResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Tipo de chamada não encontrado' });
    }

    const modelId = ctResult.rows[0].model_id;
    const slug = `${modelId}-${call_type_id}`;

    // Redirecionar para a URL real
    res.redirect(`/go/${slug}/${session_token}`);
  } catch (e) {
    console.error('[SHORTENER] Erro ao resolver link:', e.message);
    res.status(500).render('error', {
      message: 'Erro ao processar link',
      detail: e.message
    });
  }
});

module.exports = router;
