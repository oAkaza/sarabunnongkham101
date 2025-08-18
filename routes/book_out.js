// routes/book_out.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '../data');
const uploadsDir = path.join(__dirname, '../uploads');
const dataPath = path.join(dataDir, 'book_out_data.json');

// --- Ensure dirs exist ---
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// --- Multer for PDF upload ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('รองรับเฉพาะไฟล์ PDF'));
}
const upload = multer({ storage, fileFilter });

// --- Helpers ---
function loadData() {
  if (!fs.existsSync(dataPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return [];
  }
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}
function like(hay, needle) {
  if (!needle) return true;
  hay = (hay || '').toString().toLowerCase();
  needle = needle.toString().toLowerCase();
  return hay.includes(needle);
}
function nextId(list) {
  // simple incremental id as string
  const max = list.reduce((m, r) => Math.max(m, parseInt(r.id || 0, 10)), 0);
  return String(max + 1);
}

// --- Routes ---

// GET /book-out/new (ฟอร์มเพิ่ม)
router.get('/new', (req, res) => {
  res.render('book_out_form', { error: null });
});

// POST /book-out/create (บันทึกใหม่)
router.post('/create', upload.single('pdfFile'), (req, res) => {
  try {
    const {
      regNo, speed, at, signDate, from, to, subject, department
    } = req.body;

    if (!regNo) {
      return res.status(400).render('book_out_form', { error: 'กรุณากรอกเลขทะเบียนส่ง' });
    }

    const all = loadData();

    // กัน regNo ซ้ำ
    const dup = all.find(r => (r.regNo || '').trim() === regNo.trim());
    if (dup) {
      return res.status(400).render('book_out_form', { error: 'เลขทะเบียนส่งนี้มีอยู่แล้ว' });
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const rec = {
      id: nextId(all),
      regNo: regNo?.trim(),
      speed: speed || 'ปกติ',
      at: at || '',
      signDate: signDate || '',
      time: `${hh}:${mm}:${ss}`,      // เวลาส่ง (ฝั่งเซิร์ฟเวอร์)
      from: from || 'องค์การบริหารส่วนตำบลหนองขาม',
      to: to || '',
      subject: subject || '',
      department: department || '',
      pdfPath: req.file ? ('/uploads/' + path.basename(req.file.path)) : '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    all.push(rec);
    // เรียงล่าสุดบน
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    saveData(all);

    return res.redirect('/book-out/new?saved=1');
  } catch (err) {
    return res.status(500).render('book_out_form', { error: 'บันทึกไม่สำเร็จ: ' + err.message });
  }
});

// GET /book-out/list (ค้นหา + หน้า)
router.get('/list', (req, res) => {
  const q = (req.query.q || '').trim();
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const perPage = 20;

  const all = loadData();

  // filter
  const filtered = all.filter(r =>
    like(r.regNo, q) ||
    like(r.subject, q) ||
    like(r.from, q) ||
    like(r.to, q) ||
    like(r.department, q)
  );

  const total = filtered.length;
  const pages = Math.max(Math.ceil(total / perPage), 1);
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  res.render('book_out_list', {
    items, total, page, pages, q
  });
});

// GET /book-out/edit/:id (หน้าแก้ไข)
router.get('/edit/:id', (req, res) => {
  const { id } = req.params;
  const all = loadData();
  const found = all.find(r => r.id === id);
  if (!found) return res.status(404).send('ไม่พบข้อมูล');
  res.render('book_out_edit', { form: found, error: null });
});

// POST /book-out/update/:id (อัปเดต)
router.post('/update/:id', upload.single('pdfFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      regNo, speed, at, signDate, from, to, subject, department
    } = req.body;

    const all = loadData();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).send('ไม่พบข้อมูล');

    // กัน regNo ซ้ำกับรายการอื่น
    if (regNo && regNo.trim() !== all[idx].regNo) {
      const dup = all.find(r => r.regNo.trim() === regNo.trim());
      if (dup) {
        const form = { ...all[idx], ...req.body, pdfPath: all[idx].pdfPath };
        return res.status(400).render('book_out_edit', { form, error: 'เลขทะเบียนส่งนี้มีอยู่แล้ว' });
      }
    }

    // ถ้าอัปไฟล์ใหม่ ลบทิ้งไฟล์เดิม (ถ้ามี)
    let pdfPath = all[idx].pdfPath || '';
    if (req.file) {
      if (pdfPath) {
        const abs = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));
        fs.existsSync(abs) && fs.unlink(abs, () => {});
      }
      pdfPath = '/uploads/' + path.basename(req.file.path);
    }

    const nowISO = new Date().toISOString();
    all[idx] = {
      ...all[idx],
      regNo: regNo?.trim() || all[idx].regNo,
      speed: speed || 'ปกติ',
      at: at || '',
      signDate: signDate || '',
      from: from || 'องค์การบริหารส่วนตำบลหนองขาม',
      to: to || '',
      subject: subject || '',
      department: department || '',
      pdfPath,
      updatedAt: nowISO,
    };

    saveData(all);
    return res.redirect(`/book-out/edit/${id}?saved=1`);
  } catch (err) {
    const form = { ...req.body, id: req.params.id };
    return res.status(500).render('book_out_edit', { form, error: 'แก้ไขไม่สำเร็จ: ' + err.message });
  }
});

// POST /book-out/delete/:id (ลบ - ต้องใส่รหัสผ่าน)
router.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
  if (password !== ADMIN_PASSWORD) {
    return res.redirect('/book-out/list?derr=1');
  }

  const all = loadData();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return res.redirect('/book-out/list');

  // ลบไฟล์ PDF ถ้ามี
  const pdfPath = all[idx].pdfPath;
  if (pdfPath) {
    const abs = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));
    try { fs.existsSync(abs) && await fsp.unlink(abs); } catch {}
  }

  all.splice(idx, 1);
  saveData(all);
  return res.redirect('/book-out/list?deleted=1');
});

// GET /book-out/export (ดาวน์โหลด Excel)
router.get('/export', (req, res) => {
  const q = (req.query.q || '').trim();
  const all = loadData();
  const filtered = all.filter(r =>
    like(r.regNo, q) ||
    like(r.subject, q) ||
    like(r.from, q) ||
    like(r.to, q) ||
    like(r.department, q)
  );

  const rows = filtered.map((r, i) => ({
    ลำดับ: i + 1,
    เลขทะเบียนส่ง: r.regNo,
    ชั้นความเร็ว: r.speed,
    ที่: r.at,
    ลงวันที่: r.signDate,
    เวลาส่ง: r.time,
    จาก: r.from,
    ถึง: r.to,
    เรื่อง: r.subject,
    การปฏิบัติ: r.department,
    ไฟล์: r.pdfPath,
    สร้างเมื่อ: r.createdAt,
    แก้ไขเมื่อ: r.updatedAt,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'BookOut');

  const fname = `book_out_export_${Date.now()}.xlsx`;
  const full = path.join(dataDir, fname);
  XLSX.writeFile(wb, full);

  res.download(full, fname, err => {
    if (!err) setTimeout(() => fs.existsSync(full) && fs.unlinkSync(full), 5000);
  });
});

// root of /book-out -> redirect to list
router.get('/', (req, res) => res.redirect('/book-out/list'));

module.exports = router;
