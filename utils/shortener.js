// Gerador de links encurtados
// Gera códigos curtos like: 5pc-6nhr-fo8

const { query: db } = require('../db/database');

// Caracteres permitidos no código encurtado (sem ambiguidade visual)
const ALLOWED_CHARS = '2345679acdefghjkmnpqrstvwxyz';

/**
 * Gera um código aleatório único para link encurtado
 * Formato: XXX-XXX-XXX (9 caracteres + 2 hífens)
 */
function generateShortCode() {
  let code = '';
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 6) {
      code += '-';
    } else {
      code += ALLOWED_CHARS.charAt(Math.floor(Math.random() * ALLOWED_CHARS.length));
    }
  }
  return code;
}

/**
 * Cria um link encurtado no banco de dados
 * @param {number} sessionId - ID da sessão de chamada
 * @returns {string} short_code gerado
 */
async function createShortenedLink(sessionId) {
  let shortCode;
  let attempts = 0;
  const maxAttempts = 10;

  // Tenta gerar um código único (com retry em caso de colisão)
  while (attempts < maxAttempts) {
    shortCode = generateShortCode();
    try {
      const result = await db(
        'INSERT INTO shortened_links (short_code, session_id) VALUES ($1, $2) RETURNING short_code',
        [shortCode, sessionId]
      );
      return result.rows[0].short_code;
    } catch (err) {
      if (err.code === '23505') { // Unique constraint violation
        attempts++;
        continue;
      }
      throw err;
    }
  }

  throw new Error('Falha ao gerar código encurtado único após 10 tentativas');
}

/**
 * Resolve um código encurtado para o token de sessão real
 * @param {string} shortCode - Código encurtado (ex: 5pc-6nhr-fo8)
 * @returns {object} { sessionToken, callTypeId } ou null se não encontrado
 */
async function resolveShortenedLink(shortCode) {
  try {
    const result = await db(
      `SELECT sc.session_token, sc.call_type_id, sc.id as session_id
       FROM shortened_links sl
       JOIN sessions_calls sc ON sl.session_id = sc.id
       WHERE sl.short_code = $1`,
      [shortCode]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    console.error('[SHORTENER] Erro ao resolver link encurtado:', err.message);
    throw err;
  }
}

module.exports = {
  generateShortCode,
  createShortenedLink,
  resolveShortenedLink
};
