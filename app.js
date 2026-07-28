'use strict';

/*
 * Minimal, no-backend contact sync between Google and Microsoft.
 *
 * Security & privacy model
 * ------------------------
 * - No server. This is a static page; contact data moves directly between the
 *   browser and Google / Microsoft. No third party (including us) sees it.
 * - No client secret. Google uses the GIS token flow; Microsoft uses MSAL with
 *   PKCE as a public SPA client. Neither needs a secret in the browser.
 * - No refresh tokens. We never request Microsoft's "offline_access", and the
 *   Google token flow doesn't return one. Access tokens live in memory only.
 * - Hard 1-hour cap. Tokens are dropped on sign-out, on tab close, and no later
 *   than one hour after connecting — after that the user simply reconnects.
 * - Nothing is persisted that isn't required to run the current sync.
 */

const cfg = window.APP_CONFIG;

const SESSION_MAX_MS = 60 * 60 * 1000; // one hour, then reconnect

/* Per-provider runtime state. `token`/`email`/`contacts` are held in memory. */
const state = {
  google:    { token: null, expiresAt: 0, email: null, contacts: null },
  microsoft: { token: null, expiresAt: 0, email: null, contacts: null },
};

let googleTokenClient = null; // lazy GIS token client
let msal = null;              // MSAL PublicClientApplication
let msalAccount = null;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setMeta(provider, msg, isError) {
  const node = $(provider === 'google' ? 'g-meta' : 'm-meta');
  node.textContent = msg || '';
  node.style.color = isError ? 'var(--err)' : '';
}

/* ------------------------------------------------------------------ *
 * Google — connect via Google Identity Services token flow
 * ------------------------------------------------------------------ */
function connectGoogle() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    setMeta('google', 'ה‑SDK של Google עדיין נטען, נסו שוב בעוד רגע.', true);
    return;
  }
  if (!googleTokenClient) {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.google.clientId,
      scope: cfg.google.scope,
      callback: onGoogleToken,
      error_callback: (err) => {
        setMeta('google', 'ההתחברות בוטלה או נכשלה.', true);
        console.warn('Google auth error', err);
      },
    });
  }
  setMeta('google', 'פותח חלון התחברות…');
  // No refresh token is ever issued by this flow.
  googleTokenClient.requestAccessToken();
}

async function onGoogleToken(resp) {
  if (resp.error || !resp.access_token) {
    setMeta('google', 'לא התקבל אישור.', true);
    return;
  }
  const ttl = Math.min((Number(resp.expires_in) || 3600) * 1000, SESSION_MAX_MS);
  state.google.token = resp.access_token;
  state.google.expiresAt = Date.now() + ttl;
  state.google.contacts = null;
  setMeta('google', 'טוען פרטי חשבון…');
  try {
    const info = await gapiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    state.google.email = info.email || 'חשבון Google';
  } catch {
    state.google.email = 'חשבון Google';
  }
  setMeta('google', '');
  render();
}

function disconnectGoogle() {
  const t = state.google.token;
  if (t && google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(t); } catch { /* best effort */ }
  }
  state.google = { token: null, expiresAt: 0, email: null, contacts: null };
  render();
}

/* ------------------------------------------------------------------ *
 * Microsoft — connect via MSAL (popup, PKCE, no secret, no offline_access)
 * ------------------------------------------------------------------ */
function initMsal() {
  if (msal || !window.msal) return;
  msal = new window.msal.PublicClientApplication({
    auth: {
      clientId: cfg.microsoft.clientId,
      authority: cfg.microsoft.authority,
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: {
      // sessionStorage clears when the tab closes; we also clear it explicitly
      // on sign-out and on timeout. No tokens survive the session.
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  });
}

async function connectMicrosoft() {
  initMsal();
  if (!msal) {
    setMeta('microsoft', 'ה‑SDK של Microsoft עדיין נטען, נסו שוב בעוד רגע.', true);
    return;
  }
  setMeta('microsoft', 'פותח חלון התחברות…');
  try {
    const login = await msal.loginPopup({ scopes: cfg.microsoft.scopes, prompt: 'select_account' });
    msalAccount = login.account;
    msal.setActiveAccount(msalAccount);
    // loginPopup already returns an access token for the requested scopes; only
    // fall back to a separate acquisition if for some reason it didn't.
    let accessToken = login.accessToken;
    let expiresOn = login.expiresOn;
    if (!accessToken) {
      const tok = await acquireMsToken();
      accessToken = tok.accessToken;
      expiresOn = tok.expiresOn;
    }
    state.microsoft.token = accessToken;
    state.microsoft.expiresAt = Date.now() + tokenTtl(expiresOn);
    state.microsoft.email = msalAccount.username || 'חשבון Microsoft';
    state.microsoft.contacts = null;
    setMeta('microsoft', '');
    render();
  } catch (err) {
    setMeta('microsoft', 'ההתחברות בוטלה או נכשלה.', true);
    console.warn('Microsoft auth error', err);
  }
}

async function acquireMsToken() {
  const req = { scopes: cfg.microsoft.scopes, account: msalAccount };
  try {
    return await msal.acquireTokenSilent(req);
  } catch {
    return await msal.acquireTokenPopup(req);
  }
}

function tokenTtl(expiresOn) {
  const ms = expiresOn ? (new Date(expiresOn).getTime() - Date.now()) : 3600 * 1000;
  return Math.min(Math.max(ms, 60 * 1000), SESSION_MAX_MS);
}

function disconnectMicrosoft() {
  // Local sign-out only (no popup). clearCache() exists in newer MSAL builds;
  // the sessionStorage sweep below is the guaranteed cleanup.
  try {
    if (msal && typeof msal.clearCache === 'function') msal.clearCache();
  } catch { /* best effort */ }
  // Belt and suspenders: drop any MSAL keys left in sessionStorage.
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('msal.') || k.includes('login.windows') || k.includes(cfg.microsoft.clientId))) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
  msalAccount = null;
  state.microsoft = { token: null, expiresAt: 0, email: null, contacts: null };
  render();
}

/* ------------------------------------------------------------------ *
 * HTTP helpers (Bearer token, JSON) with light retry on 429/5xx
 * ------------------------------------------------------------------ */
async function authFetch(provider, url, options = {}) {
  const token = state[provider].token;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // Token no longer valid — force reconnect.
    state[provider].token = null;
    state[provider].expiresAt = 0;
    render();
    throw new Error('פג תוקף החיבור, יש להתחבר מחדש.');
  }
  return res;
}

async function gapiFetch(url, options) {
  const res = await authFetch('google', url, options);
  if (!res.ok) throw new Error('Google API ' + res.status + ': ' + (await res.text()));
  return res.json();
}

async function graphFetch(url, options) {
  const res = await authFetch('microsoft', url, options);
  if (!res.ok) throw new Error('Microsoft Graph ' + res.status + ': ' + (await res.text()));
  return res.json();
}

/* ------------------------------------------------------------------ *
 * Fetch all contacts (with pagination) and normalize to a common shape
 * ------------------------------------------------------------------ */

/* Common shape: { firstName, lastName, displayName, emails[], phones[],
 *                 organization, jobTitle } */

async function fetchGoogleContacts() {
  const fields = 'names,emailAddresses,phoneNumbers,organizations';
  let url = 'https://people.googleapis.com/v1/people/me/connections'
    + '?personFields=' + fields + '&pageSize=1000';
  const out = [];
  let pageToken = '';
  do {
    const page = await gapiFetch(url + (pageToken ? '&pageToken=' + pageToken : ''));
    for (const p of page.connections || []) out.push(normalizeGoogle(p));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return out;
}

function normalizeGoogle(p) {
  const name = (p.names && p.names[0]) || {};
  const org = (p.organizations && p.organizations[0]) || {};
  return {
    firstName: name.givenName || '',
    lastName: name.familyName || '',
    displayName: name.displayName || '',
    emails: (p.emailAddresses || []).map((e) => e.value).filter(Boolean),
    phones: (p.phoneNumbers || []).map((e) => e.value).filter(Boolean),
    organization: org.name || '',
    jobTitle: org.title || '',
  };
}

async function fetchMicrosoftContacts() {
  const select = 'givenName,surname,displayName,emailAddresses,businessPhones,homePhones,mobilePhone,companyName,jobTitle';
  let url = 'https://graph.microsoft.com/v1.0/me/contacts?$select=' + select + '&$top=100';
  const out = [];
  while (url) {
    const page = await graphFetch(url);
    for (const c of page.value || []) out.push(normalizeMicrosoft(c));
    url = page['@odata.nextLink'] || '';
  }
  return out;
}

function normalizeMicrosoft(c) {
  const phones = [
    ...(c.businessPhones || []),
    ...(c.homePhones || []),
    ...(c.mobilePhone ? [c.mobilePhone] : []),
  ].filter(Boolean);
  return {
    firstName: c.givenName || '',
    lastName: c.surname || '',
    displayName: c.displayName || '',
    emails: (c.emailAddresses || []).map((e) => e.address).filter(Boolean),
    phones,
    organization: c.companyName || '',
    jobTitle: c.jobTitle || '',
  };
}

/* ------------------------------------------------------------------ *
 * Map common shape -> provider payloads for CREATE
 * ------------------------------------------------------------------ */
function toGooglePerson(c) {
  const person = {};
  if (c.firstName || c.lastName || c.displayName) {
    const name = { givenName: c.firstName || undefined, familyName: c.lastName || undefined };
    // People API writes structured names; if we only have a display name, put it
    // in givenName so the contact is still created with a readable name.
    if (!c.firstName && !c.lastName && c.displayName) name.givenName = c.displayName;
    person.names = [name];
  }
  if (c.emails.length) person.emailAddresses = c.emails.map((v) => ({ value: v }));
  if (c.phones.length) person.phoneNumbers = c.phones.map((v) => ({ value: v }));
  if (c.organization || c.jobTitle) {
    person.organizations = [{ name: c.organization || undefined, title: c.jobTitle || undefined }];
  }
  return person;
}

function toMicrosoftContact(c) {
  const contact = {};
  if (c.firstName) contact.givenName = c.firstName;
  if (c.lastName) contact.surname = c.lastName;
  if (c.displayName) contact.displayName = c.displayName;
  else if (c.firstName || c.lastName) contact.displayName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  if (c.emails.length) {
    contact.emailAddresses = c.emails.map((v) => ({ address: v, name: contact.displayName || v }));
  }
  if (c.phones.length) {
    contact.mobilePhone = c.phones[0];
    const rest = c.phones.slice(1, 3); // Graph allows a small number of business phones
    if (rest.length) contact.businessPhones = rest;
  }
  if (c.organization) contact.companyName = c.organization;
  if (c.jobTitle) contact.jobTitle = c.jobTitle;
  return contact;
}

async function createGoogleContact(c) {
  return retryCreate(() =>
    gapiFetch('https://people.googleapis.com/v1/people:createContact', {
      method: 'POST',
      body: JSON.stringify(toGooglePerson(c)),
    }));
}

async function createMicrosoftContact(c) {
  return retryCreate(() =>
    graphFetch('https://graph.microsoft.com/v1.0/me/contacts', {
      method: 'POST',
      body: JSON.stringify(toMicrosoftContact(c)),
    }));
}

async function retryCreate(fn) {
  try {
    return await fn();
  } catch (err) {
    // One gentle retry for rate limiting / transient server errors.
    if (/ 429| 500| 503/.test(String(err.message))) {
      await sleep(1500);
      return await fn();
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Diff: which source contacts are missing from the destination
 * ------------------------------------------------------------------ */
function emailKey(e) { return e.trim().toLowerCase(); }
function nameKey(c) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim().toLowerCase();
  return n || (c.displayName || '').trim().toLowerCase();
}

function computeMissing(source, destination) {
  const destEmails = new Set();
  const destNames = new Set();
  for (const c of destination) {
    for (const e of c.emails) destEmails.add(emailKey(e));
    const n = nameKey(c);
    if (n) destNames.add(n);
  }
  const seenEmails = new Set(); // avoid duplicating within the source itself
  const seenNames = new Set();
  const missing = [];
  for (const c of source) {
    const emails = c.emails.map(emailKey).filter(Boolean);
    const n = nameKey(c);
    if (!emails.length && !n) continue; // nothing to identify this contact by

    // Match preference: by email when available, otherwise by name.
    const existsInDest = emails.length
      ? emails.some((e) => destEmails.has(e))
      : destNames.has(n);
    if (existsInDest) continue;

    const dupInBatch = emails.length
      ? emails.some((e) => seenEmails.has(e))
      : (n && seenNames.has(n));
    if (dupInBatch) continue;

    emails.forEach((e) => seenEmails.add(e));
    if (n) seenNames.add(n);
    missing.push(c);
  }
  return missing;
}

/* ------------------------------------------------------------------ *
 * Flow: preview and sync
 * ------------------------------------------------------------------ */
function currentDirection() {
  const sel = document.querySelector('input[name="dir"]:checked');
  return sel ? sel.value : 'g2m';
}

let previewList = []; // the current set of missing contacts under review

async function onPreview() {
  if (!bothConnected()) return;
  const dir = currentDirection();
  const [srcP, dstP] = dir === 'g2m' ? ['google', 'microsoft'] : ['microsoft', 'google'];
  if (!ensureFresh(srcP) || !ensureFresh(dstP)) {
    showBanner('פג תוקף אחד החיבורים. יש להתחבר מחדש.');
    return;
  }

  const btn = $('preview-btn');
  btn.disabled = true;
  btn.textContent = 'טוען אנשי קשר…';
  $('diff-panel').classList.remove('hidden');
  $('diff-summary').textContent = 'קורא אנשי קשר משני החשבונות…';
  $('diff-list').innerHTML = '';
  $('list-controls').classList.add('hidden');
  $('results-panel').classList.add('hidden');

  try {
    const [src, dst] = await Promise.all([
      fetchContacts(srcP),
      fetchContacts(dstP),
    ]);
    previewList = computeMissing(src, dst);

    const srcLabel = srcP === 'google' ? 'Google' : 'Microsoft';
    const dstLabel = dstP === 'google' ? 'Google' : 'Microsoft';
    $('diff-summary').textContent =
      `${srcLabel}: ${src.length} אנשי קשר · ${dstLabel}: ${dst.length} · חדשים להעתקה: ${previewList.length}`;

    renderDiffList(previewList, dstLabel);
  } catch (err) {
    $('diff-summary').textContent = 'שגיאה בטעינה: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'טעינה ותצוגה מקדימה';
  }
}

async function fetchContacts(provider) {
  if (state[provider].contacts) return state[provider].contacts;
  const list = provider === 'google'
    ? await fetchGoogleContacts()
    : await fetchMicrosoftContacts();
  state[provider].contacts = list;
  return list;
}

function renderDiffList(list, dstLabel) {
  const ul = $('diff-list');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="contact-row"><span class="who">כל אנשי הקשר כבר קיימים ב‑' + dstLabel + '. אין מה להעתיק. 🎉</span></li>';
    $('list-controls').classList.add('hidden');
    return;
  }
  list.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'contact-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.idx = String(i);
    cb.className = 'pick';

    const who = document.createElement('div');
    who.className = 'who';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '(ללא שם)';
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = [c.emails[0], c.phones[0]].filter(Boolean).join(' · ') || '—';
    who.append(name, detail);

    const status = document.createElement('span');
    status.className = 'rstatus';
    status.id = 'row-' + i;

    li.append(cb, who, status);
    ul.append(li);
  });
  $('select-all').checked = true;
  $('list-controls').classList.remove('hidden');
}

async function onSync() {
  const dir = currentDirection();
  const [srcP, dstP] = dir === 'g2m' ? ['google', 'microsoft'] : ['microsoft', 'google'];
  if (!ensureFresh(dstP) || !ensureFresh(srcP)) {
    showBanner('פג תוקף אחד החיבורים. יש להתחבר מחדש.');
    return;
  }

  const picks = Array.from(document.querySelectorAll('.pick'))
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.dataset.idx));
  if (!picks.length) return;

  const createFn = dstP === 'google' ? createGoogleContact : createMicrosoftContact;
  const dstLabel = dstP === 'google' ? 'Google' : 'Microsoft';

  $('sync-btn').disabled = true;
  $('results-panel').classList.remove('hidden');
  $('progress').classList.remove('hidden');
  $('results').innerHTML = '';
  let done = 0, ok = 0, fail = 0;

  for (const idx of picks) {
    const c = previewList[idx];
    const rowStatus = $('row-' + idx);
    try {
      await createFn(c);
      ok++;
      if (rowStatus) { rowStatus.textContent = '✓ נוצר'; rowStatus.className = 'rstatus ok'; }
    } catch (err) {
      fail++;
      if (rowStatus) { rowStatus.textContent = '✗ נכשל'; rowStatus.className = 'rstatus err'; }
      console.warn('create failed', c, err);
    }
    done++;
    updateProgress(done, picks.length);
    await sleep(120); // be gentle with rate limits
  }

  // Destination cache is now stale; drop it so a re-preview reflects reality.
  state[dstP].contacts = null;

  const res = $('results');
  res.innerHTML =
    `<p class="result-line result-ok">✓ נוצרו ${ok} אנשי קשר ב‑${dstLabel}.</p>` +
    (fail ? `<p class="result-line result-err">✗ ${fail} נכשלו (ראו סימון ברשימה).</p>` : '');
  $('sync-btn').disabled = false;
}

function updateProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress-text').textContent = `מעתיק ${done} מתוך ${total}…`;
}

/* ------------------------------------------------------------------ *
 * Session / expiry handling
 * ------------------------------------------------------------------ */
function ensureFresh(provider) {
  const s = state[provider];
  if (!s.token) return false;
  if (Date.now() >= s.expiresAt) {
    if (provider === 'google') disconnectGoogle(); else disconnectMicrosoft();
    return false;
  }
  return true;
}

function bothConnected() {
  return ensureFresh('google') && ensureFresh('microsoft');
}

function showBanner(msg) {
  const b = $('session-banner');
  if (!msg) { b.classList.add('hidden'); return; }
  b.textContent = msg;
  b.classList.remove('hidden');
}

/* Ticks once a second: updates the countdown and expires stale sessions. */
function tick() {
  let anyExpired = false;
  for (const p of ['google', 'microsoft']) {
    const s = state[p];
    if (s.token && Date.now() >= s.expiresAt) {
      if (p === 'google') disconnectGoogle(); else disconnectMicrosoft();
      anyExpired = true;
    }
  }
  if (anyExpired) showBanner('החיבור פג לאחר שעה. יש להתחבר מחדש כדי להמשיך.');
  updateCountdowns();
}

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

function updateCountdowns() {
  for (const [p, node] of [['google', 'g-meta'], ['microsoft', 'm-meta']]) {
    const s = state[p];
    if (!s.token) continue;
    // Only take over the meta line when it's empty or already showing a
    // countdown — never stomp on a transient status message.
    const cur = $(node).textContent;
    if (cur === '' || cur.startsWith('מחובר')) {
      $(node).textContent = 'מחובר · פג בעוד ' + fmt(s.expiresAt - Date.now());
      $(node).style.color = '';
    }
  }
}

/* ------------------------------------------------------------------ *
 * Render connection state
 * ------------------------------------------------------------------ */
function render() {
  renderProvider('google', 'g-acct', 'g-connect', 'g-disconnect', 'card-google');
  renderProvider('microsoft', 'm-acct', 'm-connect', 'm-disconnect', 'card-microsoft');

  const ready = bothConnected();
  $('preview-btn').disabled = !ready;
  if (ready) showBanner('');

  updateCountdowns();
}

function renderProvider(provider, acctId, connectId, disconnectId, cardId) {
  const s = state[provider];
  const connected = !!s.token;
  const acct = $(acctId);
  acct.textContent = connected ? (s.email || 'מחובר') : 'לא מחובר';
  acct.classList.toggle('on', connected);
  $(connectId).classList.toggle('hidden', connected);
  $(disconnectId).classList.toggle('hidden', !connected);
  $(cardId).classList.toggle('connected', connected);
}

/* ------------------------------------------------------------------ *
 * Wire up
 * ------------------------------------------------------------------ */
function boot() {
  if (!cfg || !cfg.google || !cfg.microsoft ||
      cfg.google.clientId.startsWith('YOUR_') || cfg.microsoft.clientId.startsWith('YOUR_')) {
    showBanner('הגדרה חסרה: העתיקו את config.example.js אל config.js ומלאו את מזהי הלקוח. ראו SETUP.md.');
  }
  initMsal();

  $('g-connect').addEventListener('click', connectGoogle);
  $('g-disconnect').addEventListener('click', disconnectGoogle);
  $('m-connect').addEventListener('click', connectMicrosoft);
  $('m-disconnect').addEventListener('click', disconnectMicrosoft);
  $('preview-btn').addEventListener('click', onPreview);
  $('sync-btn').addEventListener('click', onSync);
  $('select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.pick').forEach((cb) => { cb.checked = e.target.checked; });
  });

  setInterval(tick, 1000);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
