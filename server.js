// Vercel must use api/*.js serverless functions. This legacy Express entrypoint is intentionally inert.
// Keeping this file prevents accidental local-server startup from crashing a Vercel deployment.
module.exports = (req, res) => {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Use the Vercel API functions under /api.' }));
};
