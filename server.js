#!/usr/bin/env node
'use strict';

/*
 * Optional zero-dependency static server.
 *
 * You do NOT need this — any static server works (see SETUP.md). Its only job is
 * to serve the files on a fixed origin AND send real security headers (a proper
 * Content-Security-Policy header is stronger than the <meta> fallback in the HTML).
 *
 *   node server.js            # http://localhost:8000
 *   PORT=5173 node server.js  # custom port
 *
 * Whichever origin you use here must be registered with Google and Microsoft
 * (see SETUP.md).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://alcdn.msauth.net https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://www.googleapis.com https://people.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://www.gstatic.com https://graph.microsoft.com https://login.microsoftonline.com https://login.live.com",
  "frame-src https://accounts.google.com https://login.microsoftonline.com https://login.live.com",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', // needed for auth popups
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(ROOT, path.normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Serving contacts-sync on http://localhost:' + PORT);
  console.log('Make sure this exact origin is registered with Google & Microsoft (see SETUP.md).');
});
