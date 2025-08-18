// routes/announce.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '../data');
const uploadsDir = path.join(__dirname, '../uploads');
const dataPath = path.join(dataDir, 'announce_data.json');

// ensure dirs
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer (PDF only)
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

// helpers
function loadData(){
  if (!fs.existsSync(dataPath)) return [];
  try { return JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
  catch { return []; }
}
function saveData(data){ fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8'); }
function like(hay, needle){
  if (!needle) return true;
  hay = (hay || '').toString().toLowerCase();
  needle = needle.toString().toLowerCase();
  return hay.includes(needle);
}
function nextId(list){
  const max = list.reduce((m, r) => Math.max(m, parseInt(r.id || 0, 10)), 0);
  return String(max + 1);
}

// ===== Routes =====

// GET /announce/new
router.get('/new', (req, res) => {
  res.render('announce_form', { error: null });
});

// POST /announce/create
router.post('/create', upload.single('pdfFile'), (req, res) => {
  try{
    const { announceNo, subject, announceDate, department } = req.body;
    if (!announceNo) {
      return res.status(400).render('announce_form', { error: 'กรุณากรอกเลขที่ประกาศ' });
    }

    const all = loadData();
    const dup = all.find(r => (r.announceNo || '').trim() === announceNo.trim());
    if (dup) {
      return res.status(400).render('announce_form', { error: 'เลขที่ประกาศนี้มีอยู่แล้ว' });
    }

    const now = new Date();
    const rec = {
      id: nextId(all),
      announceNo: announceNo.trim(),
      subject: subject || '',
      announceDate: announceDate || '',
      department: department || '',
      pdfPath: req.file ? ('/uploads/' + path.basename(req.file.path)) : '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    all.push(rec);
    all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    saveData(all);
    return res.redirect('/announce/new?saved=1');
  }catch(err){
    return res.status(500).render('announce_form', { error: 'บันทึกไม่สำเร็จ: ' + err.message });
  }
});

// GET /announce/list
router.get('/list', (req, res) => {
  const q = (req.query.q || '').trim();
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const perPage = 20;

  const all = loadData();
  const filtered = all.filter(r =>
    like(r.announceNo, q) ||
    like(r.subject, q) ||
    like(r.department, q)
  );

  const total = filtered.length;
  const pages = Math.max(Math.ceil(total / perPage), 1);
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  res.render('announce_list', { items, total, page, pages, q });
});

// GET /announce/edit/:id
router.get('/edit/:id', (req, res) => {
  const { id } = req.params;
  const all = loadData();
  const found = all.find(r => r.id === id);
  if (!found) return res.status(404).send('ไม่พบข้อมูล');
  res.render('announce_edit', { form: found, error: null });
});

// POST /announce/update/:id
router.post('/update/:id', upload.single('pdfFile'), async (req, res) => {
  try{
    const { id } = req.params;
    const { announceNo, subject, announceDate, department } = req.body;

    const all = loadData();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).send('ไม่พบข้อมูล');

    // duplicate check if changed
    if (announceNo && announceNo.trim() !== all[idx].announceNo) {
      const dup = all.find(r => r.announceNo.trim() === announceNo.trim());
      if (dup) {
        const form = { ...all[idx], ...req.body, pdfPath: all[idx].pdfPath };
        return res.status(400).render('announce_edit', { form, error: 'เลขที่ประกาศนี้มีอยู่แล้ว' });
      }
    }

    // replace file if new uploaded
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
      announceNo: announceNo?.trim() || all[idx].announceNo,
      subject: subject || '',
      announceDate: announceDate || '',
      department: department || '',
      pdfPath,
      updatedAt: nowISO,
    };

    saveData(all);
    return res.redirect(`/announce/edit/${id}?saved=1`);
  }catch(err){
    const form = { ...req.body, id: req.params.id };
    return res.status(500).render('announce_edit', { form, error: 'แก้ไขไม่สำเร็จ: ' + err.message });
  }
});

// POST /announce/delete/:id
router.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
  if (password !== ADMIN_PASSWORD) {
    return res.redirect('/announce/list?derr=1');
  }

  const all = loadData();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return res.redirect('/announce/list');

  // remove file
  const pdfPath = all[idx].pdfPath;
  if (pdfPath) {
    const abs = path.join(__dirname, '..', pdfPath.replace(/^\//, ''));
    try { fs.existsSync(abs) && await fsp.unlink(abs); } catch {}
  }

  all.splice(idx, 1);
  saveData(all);
  return res.redirect('/announce/list?deleted=1');
});

// GET /announce/export
router.get('/export', (req, res) => {
  const q = (req.query.q || '').trim();
  const all = loadData();
  const filtered = all.filter(r =>
    like(r.announceNo, q) ||
    like(r.subject, q) ||
    like(r.department, q)
  );

  const rows = filtered.map((r, i) => ({
    ลำดับ: i + 1,
    เลขที่ประกาศ: r.announceNo,
    เรื่อง: r.subject,
    'ประกาศ ณ วันที่': r.announceDate,
    การปฏิบัติ: r.department,
    ไฟล์: r.pdfPath,
    สร้างเมื่อ: r.createdAt,
    แก้ไขเมื่อ: r.updatedAt,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Announces');

  const fname = `announce_export_${Date.now()}.xlsx`;
  const full = path.join(dataDir, fname);
  XLSX.writeFile(wb, full);

  res.download(full, fname, err => {
    if (!err) setTimeout(() => fs.existsSync(full) && fs.unlinkSync(full), 5000);
  });
});

// root
router.get('/', (req, res) => res.redirect('/announce/list'));

module.exports = router;
