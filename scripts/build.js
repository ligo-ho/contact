'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const checkOnly = process.argv.includes('--check');

const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
const microsoftClientId = (process.env.MICROSOFT_CLIENT_ID || '').trim();
const microsoftTenant = (process.env.MICROSOFT_TENANT || 'common').trim();

function fail(message) {
  console.error(`Build configuration error: ${message}`);
  process.exit(1);
}

if (!googleClientId.endsWith('.apps.googleusercontent.com')) {
  fail('GOOGLE_CLIENT_ID is missing or invalid.');
}
if (!/^[0-9a-f-]{36}$/i.test(microsoftClientId)) {
  fail('MICROSOFT_CLIENT_ID is missing or invalid.');
}
if (!/^(common|consumers|organizations|[0-9a-f-]{36})$/i.test(microsoftTenant)) {
  fail('MICROSOFT_TENANT must be common, consumers, organizations, or a tenant UUID.');
}

if (checkOnly) {
  console.log('Environment configuration is valid.');
  process.exit(0);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const filename of ['index.html', 'app.js', 'style.css']) {
  fs.copyFileSync(path.join(root, filename), path.join(outDir, filename));
}

const config = `/* Generated during deployment. Client IDs are public OAuth identifiers, not secrets. */\nwindow.APP_CONFIG = ${JSON.stringify({
  google: {
    clientId: googleClientId,
    scope: 'openid email https://www.googleapis.com/auth/contacts',
  },
  microsoft: {
    clientId: microsoftClientId,
    authority: `https://login.microsoftonline.com/${microsoftTenant}`,
    scopes: ['User.Read', 'Contacts.ReadWrite'],
  },
}, null, 2)};\n`;

fs.writeFileSync(path.join(outDir, 'config.js'), config, { mode: 0o644 });
console.log('Built static production site in dist/.');
