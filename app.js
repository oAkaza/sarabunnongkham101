const express = require('express');
const path = require('path');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Basic settings ---
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));


// --- Session ---
app.use(session({
  secret: 'saraban_local_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,   // ใช้ secure cookie ได้ เพราะผู้ใช้เข้า HTTPS
    // ไม่กำหนด maxAge = session-only (ปิดเบราว์เซอร์แล้วต้องล็อกอินใหม่)
  }
}));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

  // ✅ Fixed credentials per requirement
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
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// ให้เสิร์ฟไฟล์อัปโหลดและ assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า view engine เป็น EJS (ถ้ายัง)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ใช้งาน book_in routes
const dashboardRoutes = require('./routes/dashboard');
const bookInRoutes = require('./routes/book_in');
const bookOut = require('./routes/book_out');
const noteRoutes = require('./routes/note');
const orderRoutes = require('./routes/order');
const certificateRoutes = require('./routes/certificate');
const announceRoutes = require('./routes/announce');
app.use('/dashboard', dashboardRoutes);
app.use('/book-in', bookInRoutes);
app.use('/book-out', bookOut);
app.use('/note', noteRoutes);
app.use('/order', orderRoutes);
app.use('/certificate', certificateRoutes);
app.use('/announce', announceRoutes);


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Saraban Local running at http://localhost:${PORT}`);
});