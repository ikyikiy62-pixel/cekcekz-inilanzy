const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'jobs');
fs.mkdirSync(ROOT, { recursive: true });

const upload = multer({
  dest: path.join(ROOT, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, path.extname(file.originalname).toLowerCase() === '.zip')
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/build', upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih file ZIP terlebih dahulu.' });
  const id = crypto.randomUUID();
  const jobDir = path.join(ROOT, id);
  const webDir = path.join(jobDir, 'web');
  fs.mkdirSync(webDir, { recursive: true });

  try {
    const zip = new AdmZip(req.file.path);
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/');
      if (!name || name.includes('..') || path.isAbsolute(name)) throw new Error('ZIP berisi path yang tidak aman.');
    }
    zip.extractAllTo(webDir, true);
    fs.unlinkSync(req.file.path);

    const index = findIndex(webDir);
    if (!index) throw new Error('ZIP harus berisi index.html.');

    // The actual Android build is delegated to the included build script when
    // an Android/Gradle environment is available. This keeps the web API small.
    const script = path.join(__dirname, 'scripts', 'build-apk.js');
    if (!fs.existsSync(script)) throw new Error('Build script belum tersedia.');

    execFile(process.execPath, [script, webDir, jobDir], { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) return res.status(500).json({ error: stderr || error.message, id });
      const apk = path.join(jobDir, 'app-release.apk');
      if (!fs.existsSync(apk)) return res.status(500).json({ error: 'APK gagal dibuat.', id, log: stdout });
      res.json({ ok: true, id, download: `/api/download/${id}` });
    });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/download/:id', (req, res) => {
  const apk = path.join(ROOT, req.params.id, 'app-release.apk');
  if (!fs.existsSync(apk)) return res.status(404).send('APK tidak ditemukan.');
  res.download(apk, 'app-release.apk');
});

function findIndex(dir) {
  const direct = path.join(dir, 'index.html');
  if (fs.existsSync(direct)) return direct;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      const found = findIndex(full);
      if (found) return found;
    }
  }
  return null;
}

app.listen(PORT, () => console.log(`ZIP to APK running on port ${PORT}`));
