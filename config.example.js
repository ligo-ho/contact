/*
 * Copy this file to `config.js` and fill in your two client IDs.
 * See SETUP.md for how to obtain them.
 *
 * There are NO secrets here. Client IDs are public by design — this app never
 * uses a client secret, because it runs entirely in the browser.
 */
window.APP_CONFIG = {
  google: {
    // Google Cloud Console → Credentials → OAuth client (Web application) → Client ID
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    // Minimal scopes: identify the account + read/write contacts. Nothing else.
    scope: 'openid email https://www.googleapis.com/auth/contacts',
  },
  microsoft: {
    // Azure Portal → App registrations → Overview → Application (client) ID
    clientId: 'YOUR_MICROSOFT_APPLICATION_CLIENT_ID',
    // "common" = personal + work/school accounts. Use "consumers" for personal only.
    authority: 'https://login.microsoftonline.com/common',
    // Minimal delegated scopes. NOTE: we deliberately do NOT request
    // "offline_access", so Microsoft never issues a refresh token.
    scopes: ['User.Read', 'Contacts.ReadWrite'],
  },
};
