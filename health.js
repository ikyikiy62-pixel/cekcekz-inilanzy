const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/health', (_req, res) => res.json({ ok: true, service: 'lanzy-apk-builder' }));
app.listen(port, '0.0.0.0', () => console.log(`health server listening on ${port}`));
