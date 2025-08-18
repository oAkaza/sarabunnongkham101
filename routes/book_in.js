const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const dataPath = path.join(__dirname, '../data/book_in_data.json');
const uploadDir = path.join(__dirname, '../uploads');

// ensure dirs
if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// === Multer: PDF เท่านั้น + limits ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname).toLowerCase())
});

const fileFilter = (req, file, cb) => {
  const isPdf =
    file.mimetype === 'application/pdf' ||
    path.extname(file.originalname).toLowerCase() === '.pdf';
  if (isPdf) return cb(null, true);
  return cb(new Error('รองรับเฉพาะไฟล์ PDF'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// === Helpers ===
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
function findById(id) {
  const data = loadData();
  const item = data.find(r => String(r.id) === String(id));
  return { data, item };
}
function filterItems(items, q) {
  if (!q) return items;
  const s = q.toLowerCase().trim();
  return items.filter(x =>
    [x.regNo, x.subject, x.from, x.to, x.department]
      .some(v => (v || '').toLowerCase().includes(s))
  );
}

// =============== ROUTES ===============

// ฟอร์มสร้าง
router.get('/new', (req, res) => {
  const saved = req.query.saved === '1';
  const error = req.query.error || null;
  res.render('book_in_form', { saved, error, form: {} });
});

// บันทึกสร้าง
router.post('/create', (req, res) => {
  upload.single('pdfFile')(req, res, (err) => {
    if (err) {
      return res.status(400).render('book_in_form', {
        error: err.message || 'รองรับเฉพาะไฟล์ PDF',
        form: req.body || {}
      });
    }

    const {
      regNo, receiveDate, speed, at, signDate, from, to, subject, department,
      signatureData
    } = req.body;

    if (!regNo || !regNo.trim()) {
      return res.redirect('/book-in/new?error=' + encodeURIComponent('กรุณากรอกเลขทะเบียนรับ'));
    }

    // เวลา server อัตโนมัติ
    const now = new Date();
    const time = now.toLocaleTimeString('th-TH', { hour12: false });

    const data = loadData();

    // ตรวจเลขทะเบียนซ้ำ
    const dup = data.find(x => (x.regNo || '').trim() === regNo.trim());
    if (dup) {
      return res.redirect('/book-in/new?error=' + encodeURIComponent('เลขทะเบียนรับซ้ำ! กรุณาใช้หมายเลขอื่น'));
    }

    const record = {
      id: Date.now(),
      regNo: regNo.trim(),
      receiveDate: receiveDate || '',
      time,
      speed: speed || 'ปกติ',
      at: at || '',
      signDate: signDate || '',
      from: from || '',
      to: to || 'องค์การบริหารส่วนตำบลหนองขาม',
      subject: subject || '',
      department: department || '',
      pdfPath: req.file ? `/uploads/${path.basename(req.file.path)}` : '',
      signatureData: signatureData || ''
    };

    data.unshift(record);
    saveData(data);

    // จะให้ไปหน้า list หรือ new ก็เลือกได้:
    // return res.redirect('/book-in/list?saved=1');
    return res.redirect('/book-in/new?saved=1');
  });
});

// รายการ + ค้นหา + แบ่งหน้า
router.get('/list', (req, res) => {
  const q = req.query.q || '';
  const perPage = 20;
  let items = loadData();

  items.sort((a, b) => Number(b.id) - Number(a.id)); // ล่าสุดบน
  items = filterItems(items, q);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  let page = parseInt(req.query.page || '1', 10);
  if (isNaN(page) || page < 1) page = 1;
  if (page > pages) page = pages;

  const start = (page - 1) * perPage;
  const paged = items.slice(start, start + perPage);

  res.render('book_in_list', {
    items: paged, q, page, pages, total, perPage
  });
});

// ฟอร์มแก้ไข
router.get('/edit/:id', (req, res) => {
  const { id } = req.params;
  const { item } = findById(id);
  if (!item) return res.redirect('/book-in/list');
  const saved = req.query.saved === '1';
  const error = req.query.error || null;
  res.render('book_in_edit', { saved, error, form: item });
});

// บันทึกแก้ไข
router.post('/update/:id', (req, res) => {
  upload.single('pdfFile')(req, res, (err) => {
    const { id } = req.params;

    if (err) {
      return res.redirect(`/book-in/edit/${id}?error=` + encodeURIComponent(err.message || 'รองรับเฉพาะไฟล์ PDF'));
    }

    const {
      regNo, receiveDate, speed, at, signDate, from, to, subject, department,
      signatureData
    } = req.body;

    if (!regNo || !regNo.trim()) {
      return res.redirect(`/book-in/edit/${id}?error=` + encodeURIComponent('กรุณากรอกเลขทะเบียนรับ'));
    }

    const data = loadData();
    const index = data.findIndex(r => String(r.id) === String(id));
    if (index === -1) return res.redirect('/book-in/list');

    // ตรวจเลขทะเบียนซ้ำ (ยกเว้นตัวเอง)
    const dup = data.find(r =>
      r.regNo && r.regNo.trim() === regNo.trim() && String(r.id) !== String(id)
    );
    if (dup) {
      return res.redirect(`/book-in/edit/${id}?error=` + encodeURIComponent('เลขทะเบียนรับซ้ำ! กรุณาใช้หมายเลขอื่น'));
    }

    const current = data[index];
    const pdfPath = req.file
      ? `/uploads/${path.basename(req.file.path)}`
      : (current.pdfPath || '');

    data[index] = {
      ...current,
      regNo: regNo.trim(),
      receiveDate: receiveDate || '',
      speed: speed || 'ปกติ',
      at: at || '',
      signDate: signDate || '',
      from: from || '',
      to: to || 'องค์การบริหารส่วนตำบลหนองขาม',
      subject: subject || '',
      department: department || '',
      pdfPath,
      // ถ้าเซ็นใหม่จะเป็น dataURL, ถ้าล้างจะเป็น '' ให้เคลียร์ได้
      signatureData: (typeof signatureData === 'string')
        ? signatureData
        : (current.signatureData || '')
    };

    saveData(data);
    return res.redirect(`/book-in/edit/${id}?saved=1`);
  });
});

// ลบ (ต้องใส่รหัสผ่าน 1234)
router.post('/delete/:id', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (password !== '1234') {
    return res.redirect('/book-in/list?derr=1'); // รหัสผ่านผิด
  }

  const data = loadData();
  const idx = data.findIndex(r => String(r.id) === String(id));
  if (idx === -1) return res.redirect('/book-in/list');

  const item = data[idx];

  // ลบไฟล์ PDF เดิม (เฉพาะที่อยู่ภายใต้ /uploads)
  try {
    if (item.pdfPath) {
      const rel = String(item.pdfPath).replace(/^[\\/]+/, '');
      const full = path.resolve(__dirname, '..', rel);
      const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
      if (full.startsWith(uploadsRoot) && fs.existsSync(full)) {
        fs.unlinkSync(full);
      }
    }
  } catch {}

  data.splice(idx, 1);
  saveData(data);
  return res.redirect('/book-in/list?deleted=1');
});

// export Excel (อิงผลค้นหาเดียวกับ list)
router.get('/export', (req, res) => {
  const q = req.query.q || '';
  const data = filterItems(loadData(), q);

  const rows = data.map((r, i) => ({
    ลำดับ: i + 1,
    เลขทะเบียนรับ: r.regNo || '',
    วันที่รับ: r.receiveDate || '',
    เวลา: r.time || '',
    ชั้นความเร็ว: r.speed || '',
    ที่: r.at || '',
    ลงวันที่: r.signDate || '',
    จาก: r.from || '',
    ถึง: r.to || '',
    เรื่อง: r.subject || '',
    การปฏิบัติ: r.department || '',
    ไฟล์PDF: r.pdfPath ? `.${r.pdfPath}` : '',
    ลายเซ็น: r.signatureData ? 'มี' : 'ไม่มี'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },  { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 40 },
    { wch: 18 }, { wch: 24 }, { wch: 8 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'หนังสือรับ');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = q ? `book_in_export_${Date.now()}_filter.xlsx`
                     : `book_in_export_${Date.now()}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buf);
});

module.exports = router;
