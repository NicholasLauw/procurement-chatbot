require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');

const authRoutes   = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ─── API ──────────────────────────────────────────────────────
app.use('/auth',    authRoutes);
app.use('/api',     ticketRoutes);
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── Frontend ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ Hotel Procurement running on http://localhost:${PORT}`));
