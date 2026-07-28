#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const PORT = process.env.PORT || 8000;
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/style.css', '/config.js']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  if (pathname === '/') pathname = '/index.html';
  if (!PUBLIC_FILES.has(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Not found');
  }

  const filePath = path.join(ROOT, pathname.slice(1));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
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
  console.log('Register this exact origin with Google and Microsoft.');
});
