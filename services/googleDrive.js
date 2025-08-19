// services/googleDrive.js
const { google } = require('googleapis');

/**
 * คืน client ของ Google Drive โดยใช้ Service Account ผ่าน ENV
 * ต้องมี ENV: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
 */
function getDrive() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

  // แปลง \n ให้เป็นบรรทัดจริง (เวลาวาง ENV ใน Render มักจะเป็นบรรทัดเดียว)
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * อัปโหลดไฟล์จาก Buffer ขึ้น Google Drive
 * @param {Object} options
 * @param {Buffer} options.buffer
 * @param {String} options.filename
 * @param {String} options.mimeType
 * @returns {Promise<{id:string,name:string,webViewLink:string,webContentLink:string}>}
 */
async function uploadBufferToDrive({ buffer, filename, mimeType = 'application/pdf' }) {
  const drive = getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // ใช้ Node stream จาก Buffer เพื่อส่งเข้า Google API
  const { Readable } = require('stream');
  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const fileMetadata = {
    name: filename,
    parents: folderId ? [folderId] : undefined,
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id,name,webViewLink,webContentLink',
  });

  return res.data;
}

module.exports = {
  uploadBufferToDrive,
};
