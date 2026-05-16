const { getDefaultConfig } = require('expo/metro-config');
const https = require('https');

const config = getDefaultConfig(__dirname);

const UPSTREAM = 'https://anime.ixacg.top';

config.server = config.server || {};
const prevEnhanceMiddleware = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, server) => {
  const wrapped = prevEnhanceMiddleware
    ? prevEnhanceMiddleware(middleware, server)
    : middleware;

  return (req, res, next) => {
    if (req.url && req.url.startsWith('/api/')) {
      const target = new URL(req.url, UPSTREAM);
      const proxyReq = https.request(
        target,
        {
          method: req.method,
          headers: { ...req.headers, host: target.host },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      req.pipe(proxyReq);
      return;
    }
    return wrapped(req, res, next);
  };
};

module.exports = config;
