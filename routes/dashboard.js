const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ถ้ามี middleware จริงของโปรเจกต์ ให้ import มาใช้แทนได้เลย
const requireAuth = (req, res, next) =>
  (req.session && req.session.user ? next() : res.redirect('/login'));

// ===== Settings =====
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DEBUG_COUNTS = process.env.DEBUG_COUNTS === '1';

// ===== Helpers =====
let printedOnce = false;

const ensureJsonFile = (basename) => {
  const p = path.join(DATA_DIR, basename);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf8');
  return p;
};

const safeReadJsonArray = (basename, ensure = false) => {
  const filePath = ensure ? ensureJsonFile(basename) : path.join(DATA_DIR, basename);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  } catch {
    return [];
  }
};

const countFromJson = (basename, label, ensure = false) => {
  const arr = safeReadJsonArray(basename, ensure);
  if (DEBUG_COUNTS) console.log(`[dashboard] ${label}: ${arr.length}`);
  return arr.length;
};

// เลือกรายการล่าสุดโดยพยายามดูฟิลด์วันที่ก่อน
const dateFieldsPriority = [
  'createdAt', 'receiveDate', 'signDate',
  'issueDate', 'announceDate', 'orderDate', 'time'
];
const toMillis = (val) => {
  if (!val) return 0;
  // รองรับทั้ง Date ISO, YYYY-MM-DD, เวลา HH:mm:ss ฯลฯ
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};
const pickLatest = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  // หา field วันที่แรกที่พบในชุดข้อมูล
  const field = dateFieldsPriority.find(f => arr.some(x => x && x[f]));
  if (field) {
    return [...arr].sort((a, b) => toMillis(b?.[field]) - toMillis(a?.[field]))[0];
  }
  // ถ้าไม่มีฟิลด์วันที่เลย ใช้ตัวสุดท้าย (เผื่อ push ตามเวลาจริง)
  return arr[arr.length - 1];
};

// ===== Route =====
router.get('/', requireAuth, (req, res) => {
  if (!printedOnce) {
    console.log('[dashboard] Using data dir:', DATA_DIR);
    printedOnce = true;
  }

  // อ่านข้อมูลทั้งหมด (ครั้งเดียว)
  const bookInArr   = safeReadJsonArray('book_in_data.json');
  const bookOutArr  = safeReadJsonArray('book_out_data.json');
  const noteArr     = safeReadJsonArray('note_data.json');
  const orderArr    = safeReadJsonArray('order_data.json');
  const certArr     = safeReadJsonArray('certificate_data.json');
  const announceArr = safeReadJsonArray('announce_data.json', true); // ensure

  const counts = {
    bookIn:   bookInArr.length,
    bookOut:  bookOutArr.length,
    note:     noteArr.length,
    order:    orderArr.length,
    cert:     certArr.length,
    announce: announceArr.length,
  };

  // เลือกตัวล่าสุดของแต่ละประเภท
  const lastIn   = pickLatest(bookInArr);
  const lastOut  = pickLatest(bookOutArr);
  const lastNote = pickLatest(noteArr);
  const lastOrd  = pickLatest(orderArr);
  const lastCer  = pickLatest(certArr);
  const lastAnn  = pickLatest(announceArr);

  // map ให้ตรงชื่อฟิลด์ที่หน้า EJS เรียกใช้
  const latest = {
    bookIn:   lastIn   ? { regNo: lastIn.regNo } : null,
    bookOut:  lastOut  ? { regNo: lastOut.regNo } : null,
    note:     lastNote ? { noteNo: lastNote.noteNo } : null,
    order:    lastOrd  ? { orderNo: lastOrd.orderNo } : null,
    cert:     lastCer  ? { certificateNo: lastCer.certificateNo } : null,
    announce: lastAnn  ? { announceNo: lastAnn.announceNo } : null,
  };

  res.render('dashboard', {
    user: req.session?.user || req.user,
    counts,
    latest, // ✅ ส่งเข้า view
  });
});

module.exports = router;
