import crypto from 'node:crypto';

const OWNER = 'ikyikiy62-pixel';
const REPO = 'cekcekz-inilanzy';
const WORKFLOW = 'build-apk.yml';
const REF = 'feat/vercel-ready';

export const config = { api: { bodyParser: false } };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseMultipart(buf, contentType) {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) throw new Error('Invalid multipart form.');
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const parts = [];
  let start = 0;
  while (true) {
    const i = buf.indexOf(boundary, start);
    if (i < 0) break;
    const next = buf.indexOf(boundary, i + boundary.length);
    if (next < 0) break;
    const part = buf.subarray(i + boundary.length + 2, next - 2);
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep < 0) { start = next; continue; }
    const headers = part.subarray(0, sep).toString('utf8');
    const data = part.subarray(sep + 4);
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
    if (name) parts.push({ name, filename, data });
    start = next;
  }
  return parts;
}

async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Server belum dikonfigurasi: GITHUB_TOKEN belum diatur di Vercel.');
  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readBody(req);
    const parts = parseMultipart(body, req.headers['content-type'] || '');
    const zip = parts.find(p => p.name === 'zip');
    const icon = parts.find(p => p.name === 'icon');
    if (!zip || !icon) return res.status(400).json({ error: 'ZIP dan icon wajib dipilih.' });
    if (zip.data.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'ZIP maksimal 50 MB.' });
    if (icon.data.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Icon maksimal 10 MB.' });

    // Public temporary storage is intentionally avoided. The endpoint stores the inputs as GitHub release assets.
    // A unique tag makes every build isolated.
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tag = `builder-${id}`;
    const zipName = `site-${id}.zip`;
    const iconName = `icon-${id}.png`;

    const release = await github(`/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: `Builder ${id}`, draft: true, prerelease: true })
    });

    async function uploadAsset(url, data, name, contentType) {
      const u = new URL(url);
      u.searchParams.set('name', name);
      const token = process.env.GITHUB_TOKEN;
      const r = await fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, Accept: 'application/vnd.github+json' }, body: data });
      if (!r.ok) throw new Error(`Upload ${name} failed: ${r.status}`);
      return r.json();
    }

    const zipAsset = await uploadAsset(release.upload_url.replace('{?name,label}', ''), zip.data, zipName, 'application/zip');
    const iconAsset = await uploadAsset(release.upload_url.replace('{?name,label}', ''), icon.data, iconName, 'image/png');

    const zipUrl = zipAsset.browser_download_url;
    const iconUrl = iconAsset.browser_download_url;

    await github(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: REF, inputs: { zip_url: zipUrl, icon_url: iconUrl } })
    });

    return res.status(202).json({ ok: true, id, message: 'Build queued.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Build gagal.' });
  }
}
