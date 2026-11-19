# FicVault — GitHub Pages + Firebase + automatic Google Docs sync

This folder contains the writing studio, Firebase account pages, Firestore archive sync, and a secure Cloud Functions backend for automatically updating Google Docs.

## What's included

- `index.html` — original FicVault writing studio with per-account archive storage and automatic Google Docs updates after saves.
- `login.html`, `profile.html`, `settings.html` — authentication, profile, and account settings.
- `firebase.js` — Firebase web configuration and SDK setup.
- `firebase-bridge.js` — authenticated per-user archive loading and automatic Firestore sync.
- `drive-client.js` — browser wrapper for the secure Drive Cloud Functions.
- `functions/index.js` — server-side OAuth authorization-code callback, encrypted refresh-token storage, token renewal, document create/update, and disconnect handling.
- `firestore.rules` — per-user archive rules and explicit denial of client access to integration tokens and OAuth state.
- `privacy.html`, `terms.html` — updated policy language for server-assisted OAuth and one-way automatic Docs sync.

## How Google Docs sync works

1. A signed-in user chooses **Connect Google Drive** once and approves the Google `drive.file` permission.
2. Google sends an authorization code to a Firebase Cloud Function. The function exchanges it for offline credentials.
3. The Google refresh token is encrypted with AES-256-GCM and stored in a server-only Firestore integration document. The browser cannot read it. The Google OAuth client secret and encryption key are Firebase Function secrets.
4. When FicVault saves a story, it waits briefly and sends the changed story to the authenticated Cloud Function. The function renews the short-lived Google access token as needed and creates or updates that story's Google Doc.
5. FicVault records the Doc ID and its last modified time. If a Doc is edited directly in Google Docs after the last FicVault sync, automatic updates pause for that Doc to reduce the risk of overwriting external edits.

This is a **one-way sync from FicVault to Google Docs**. Changes made directly in Google Docs are not imported into the FicVault editor. A conflict can be explicitly resolved by choosing to replace the Doc with the current FicVault version after reviewing the warning.

Google access still requires user consent. Firebase sign-in alone does not grant Drive permissions. FicVault passes the signed-in email as Google's `login_hint` so the same account can be suggested, but Google still lets the user choose another account. The Drive grant is stored under the authenticated FicVault UID. Users do not paste OAuth client details into the browser; the one-time consent screen is the only per-user connection step.

## 1. Firebase Authentication and Firestore

1. Open the Firebase Console and select project `my-ficvault`.
2. Under **Authentication → Sign-in method**, enable **Email/Password** and **Google** (for the available login options).
3. Under **Authentication → Settings → Authorized domains**, add your GitHub Pages hostname, such as `YOUR-USERNAME.github.io`.
4. Create a Firestore database.
5. Publish `firestore.rules` from this folder.

FicVault stores story documents at `users/{uid}/fics/{ficId}`, archive metadata at `users/{uid}/vault/meta`, and profile data at `users/{uid}`. The OAuth refresh-token record is stored at `users/{uid}/integrations/googleDrive`; the rules deliberately deny browser clients access to this path. Cloud Functions use the Admin SDK to manage it.

## 2. Configure Google OAuth once for the application owner

These steps are for the FicVault project owner/developer, not for every FicVault user.

1. In Google Cloud Console, select the Google Cloud project associated with this app (or another project you control).
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen / Google Auth Platform. Add test users while the app is in testing mode. Complete Google's verification requirements before opening the integration to a wider public audience, if Google requires verification for the chosen app/scopes.
4. Create an OAuth 2.0 Client ID with application type **Web application**.
5. Add this exact **Authorized redirect URI**:

   `https://us-central1-my-ficvault.cloudfunctions.net/googleDriveOAuthCallback`

6. Copy the OAuth Client ID and Client Secret. They are used only by Cloud Functions and must never be committed to GitHub or embedded in browser JavaScript.

The integration requests only this scope:

`https://www.googleapis.com/auth/drive.file`

It is used for the files and folders FicVault creates or opens for this integration.

### Important domain requirement for a public launch

The sample callback in `functions/index.js` uses the default Cloud Functions hostname (`cloudfunctions.net`) so the backend can be tested before a custom domain is available. Google's current OAuth policy says production apps must use domains the app owner controls and may require verification of the domains used by the home page, Privacy Policy, Terms, and redirect URI. A default GitHub Pages address (`github.io`) and a shared Cloud Functions hostname are not domains you personally own. Before publishing Drive access to the public, use a custom domain you control for the FicVault website and a custom callback subdomain routed to this Cloud Function; then update `REDIRECT_URI` in `functions/index.js` and register that exact callback URI in the Google OAuth client. The current default callback should be treated as a development/testing configuration until this domain requirement is resolved. See Google's [OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies) and [brand verification requirements](https://developers.google.com/identity/verification/authentication-policy-compliance).

## 3. Deploy the secure Google Drive backend

**Important:** Firebase Cloud Functions require the Firebase **Blaze** (pay-as-you-go) plan and a linked Cloud Billing account. There may be no-cost quotas, but billing must be enabled and usage beyond applicable no-cost quotas can incur charges. Set budget alerts and review Cloud Functions / Cloud Run usage before opening the app to others. Budget alerts are notifications, not a guaranteed spending cap.

From the project folder:

1. Install the Firebase CLI and sign in:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use my-ficvault
   ```

2. Install the function dependencies:

   ```bash
   cd functions
   npm install
   cd ..
   ```

3. Save the Google OAuth credentials as server-side Firebase secrets:

   ```bash
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
   ```

   Paste the corresponding values when prompted. Do not put them in `firebase.js`, HTML, GitHub Actions, or any public repository file.

4. Generate a random 32-byte encryption key and store it as a secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   firebase functions:secrets:set DRIVE_TOKEN_ENCRYPTION_KEY
   ```

   Copy the generated 64-character hex value into the Firebase secret prompt. Keep it private and retain a secure backup. If you lose this key, existing stored refresh tokens cannot be decrypted and users will need to connect Drive again.

5. Deploy the functions:

   ```bash
   firebase deploy --only functions
   ```

   During deployment, Firebase will ask for `FICVAULT_APP_URL`. Enter the public base URL of the GitHub Pages project, for example `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY` (without a trailing slash). For local development, use an HTTPS tunnel or configure a separate test Firebase project; Google OAuth redirect URIs require HTTPS except approved localhost use.

The functions use the `us-central1` region. If you change the region or Firebase project, update the region/project constants in `functions/index.js`, the function region in `firebase.js`, and the registered Google OAuth redirect URI together.

## 4. Publish the website on GitHub Pages

1. Create a GitHub repository for FicVault.
2. Upload the **contents** of this folder to the repository root. Keep the `functions/` folder and Firebase config files in the repository as well.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, then choose your main branch and `/ (root)`.
5. In Firebase Authentication → Authorized domains, add the GitHub Pages hostname (for example `YOUR-USERNAME.github.io`).

The Cloud Functions backend is deployed separately with Firebase CLI; GitHub Pages only hosts the static HTML, CSS, and browser JavaScript.

## 5. What users see

- In **Settings → Google Drive & Docs**, choose **Connect Google Drive** once and approve the permission in Google's consent screen.
- Automatic Google Docs sync is enabled by default. New non-sample works get a Google Doc, and later saved edits update that same Doc after a short debounce.
- The browser must be online for an immediate push. If it closes before a queued update finishes, FicVault checks for unsynced works and retries the next time that account opens the app.
- The user can pause automatic Docs sync or disconnect Drive at any time.
- Existing Google Docs remain in the user's Drive after disconnecting or deleting a FicVault entry.
- FicVault cloud archive sync to Firestore is independent and remains automatic even when Google Drive is not connected.

## 6. Existing Google Docs from the previous browser-token integration

Old stories may contain a `driveFileId` from the previous client-side OAuth connection. The new backend will attempt to update that ID. Google may not allow the new OAuth client to access files created under a different OAuth app identity; if that happens, the backend creates a new Doc and leaves the old file untouched. Check your Drive folder after the first migration and remove old copies manually only after confirming the new Docs contain the right content.

The app also stores `driveModifiedTime` after a successful backend sync. This helps detect a Doc edited outside FicVault. Older Docs without this field do not have a prior conflict baseline, so their first backend update cannot reliably detect historical external edits. Export or duplicate important Docs before first connecting the new backend.

## 7. Archive migration and backup

When the previous browser archive is available at the same website origin, FicVault can import the old localStorage data on first account sign-in. If the website origin changes, use the existing JSON export from the old site and import it into the new site. Browser storage is scoped by origin.

Download a JSON backup before migration and periodically afterward. Firebase cloud sync and Google Docs are useful copies, but independent backups are still recommended.

## 8. Before public release

- Replace `your-email@example.com` in the policy pages with a support email you monitor.
- Review the Terms and Privacy Policy for the actual operator and retention process; these are templates, not legal advice.
- Complete Google's OAuth consent screen configuration and any required verification.
- Confirm that Firestore rules deny client access to `users/{uid}/integrations/*`.
- Test new account creation, sign-in, Drive consent, first-time document creation, subsequent updates, manual edits to a Google Doc (conflict pause), conflict replacement, disconnect, and reconnect.
- Verify no OAuth Client Secret, encryption key, refresh token, Firebase service-account key, or `.env` file is committed.

## Local testing

Serve the site over HTTP rather than opening HTML files directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. Add `localhost` to Firebase Authentication's authorized domains if you test there. For Google OAuth callback testing, use a separate OAuth client / project and configure the exact callback URI in its authorized redirect URIs.
