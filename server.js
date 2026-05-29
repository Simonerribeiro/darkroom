require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const db = require('./db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '600mb' }));
app.use(express.urlencoded({ extended: true, limit: '600mb' }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'darkroom-secret-2024',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true
  }
});

app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Log de todas as requisições
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      console.error(`[ERRO] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

const authRoutes = require('./routes/auth');
const dashRoutes = require('./routes/dashboard');
const linkRoutes = require('./routes/links');
const callRoutes = require('./routes/call');

app.use('/', authRoutes);
app.use('/dashboard', dashRoutes);
app.use('/links', linkRoutes);
app.use('/go', callRoutes);

// Página de status
app.get('/status', async (req, res) => {
  try {
    const start = Date.now();
    const dbCheck = await db.query('SELECT COUNT(*) as total FROM sessions_calls');
    const activeCheck = await db.query("SELECT COUNT(*) as total FROM sessions_calls WHERE status = 'active'");
    const pendingCheck = await db.query("SELECT COUNT(*) as total FROM sessions_calls WHERE status = 'pending'");
    const modelsCheck = await db.query('SELECT COUNT(*) as total FROM models');
    const dbTime = Date.now() - start;

    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      db_response_ms: dbTime,
      stats: {
        total_sessions: parseInt(dbCheck.rows[0].total),
        active_sessions: parseInt(activeCheck.rows[0].total),
        pending_sessions: parseInt(pendingCheck.rows[0].total),
        total_models: parseInt(modelsCheck.rows[0].total)
      }
    });
  } catch(e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Limpeza automática de sessões antigas (roda a cada 24 horas)
async function cleanOldSessions() {
  try {
    const result = await db.query(
      `DELETE FROM sessions_calls 
       WHERE created_at < NOW() - INTERVAL '7 days' 
       AND status IN ('ended', 'pending')`
    );
    console.log(`[LIMPEZA] ${result.rowCount} sessões antigas removidas`);
  } catch(e) {
    console.error('[LIMPEZA] Erro:', e.message);
  }
}

cleanOldSessions();
setInterval(cleanOldSessions, 24 * 60 * 60 * 1000);

// Captura erros globais não tratados
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Erro não tratado:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Promise rejeitada:', reason);
});

// Middleware de erro global
app.use((err, req, res, next) => {
  console.error(`[ERRO GLOBAL] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);
  });
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });
  socket.on('leave-room', (roomId) => {
    socket.to(roomId).emit('user-left', socket.id);
    socket.leave(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Darkroom rodando na porta ${PORT}`);
});
