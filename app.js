// app.js
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Basic settings ---
app.set('trust proxy', 1); // ให้ secure cookie ทำงานหลัง reverse proxy (เช่น Render)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Static files ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// --- Parsers (กำหนดครั้งเดียวพอ) ---
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// --- Session (วางก่อน routes เสมอ) ---
app.use(session({
  // ควรตั้งจาก ENV ใน production
  secret: process.env.SESSION_SECRET || 'saraban_local_secret_key',
  resave: false,
  saveUninitialized: false,
  name: 'saraban.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // true เมื่อรันหลัง HTTPS (Render)
    // ไม่กำหนด maxAge = เป็น session cookie
  }
}));

// --- Auth guard ---
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

// --- Routes ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const VALID_USER = 'user';
  const VALID_PASS = '1234';

  if (username === VALID_USER && password === VALID_PASS) {
    req.session.user = { username: 'user', displayName: 'ผู้ใช้ระบบ' };
    return res.redirect('/dashboard');
  }

  return res.status(401).render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('saraban.sid');
    res.redirect('/login');
  });
});

// ใช้งานโมดูลย่อย
const dashboardRoutes = require('./routes/dashboard');
const bookInRoutes = require('./routes/book_in');
const bookOutRoutes = require('./routes/book_out');
const noteRoutes = require('./routes/note');
const orderRoutes = require('./routes/order');
const certificateRoutes = require('./routes/certificate');
const announceRoutes = require('./routes/announce');

app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/book-in', requireAuth, bookInRoutes);
app.use('/book-out', requireAuth, bookOutRoutes);
app.use('/note', requireAuth, noteRoutes);
app.use('/order', requireAuth, orderRoutes);
app.use('/certificate', requireAuth, certificateRoutes);
app.use('/announce', requireAuth, announceRoutes);

// --- Health check (ช่วยให้แพลตฟอร์มเช็คได้ว่าแอปพร้อม) ---
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// --- 404 & Error handlers แบบเบา ๆ ---
app.use((req, res) => res.status(404).send('Not Found'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Internal Server Error');
});

// --- Listen (เรียกครั้งเดียวพอ และไม่ fix IP) ---
app.listen(PORT, () => {
  console.log(`Saraban Local running on port ${PORT}`);
});
