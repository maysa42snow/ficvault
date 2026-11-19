# FicVault — GitHub Pages + Firebase edition

This folder contains the updated FicVault writing studio, the account pages, Firebase client setup, and the Firestore security rules.

## What's included

- `index.html` — the existing FicVault writing studio, updated to require sign-in and sync each user's library to Firestore.
- `login.html` — email/password and Google sign-in, account creation, and password reset.
- `profile.html` — private profile details and archive counts.
- `settings.html` — theme/layout preferences, cloud archive status, backup download, and Google Drive configuration.
- `privacy.html` and `terms.html` — revised policy pages describing Firebase accounts and cloud storage.
- `firebase.js` — Firebase project configuration and modular SDK imports.
- `firebase-bridge.js` — signed-in user gate, one-time local archive migration, merge logic, and debounced Firestore syncing.
- `firestore.rules` — per-user read/write rules. Deploy these before allowing users to store writing.
- `account.css` — shared styles for the account pages.

## 1. Enable Firebase Authentication

1. Open the Firebase Console and select the `my-ficvault` project.
2. Go to **Authentication → Sign-in method**.
3. Enable **Email/Password**.
4. Enable **Google** and select a support email when prompted.
5. Under **Authentication → Settings → Authorized domains**, add your GitHub Pages hostname, such as `YOUR-USERNAME.github.io`. Add `localhost` if you test on a local web server.

Google sign-in on the login page is Firebase Authentication. The optional Google Drive / Google Docs integration is a separate OAuth connection configured from FicVault Settings.

## 2. Create Firestore and deploy the security rules

1. In the Firebase Console, open **Firestore Database** and create a database.
2. Open the **Rules** tab.
3. Replace the starter rules with the contents of `firestore.rules` and publish them.

The rules allow an authenticated user to access only documents under `/users/{their-own-uid}/...`. Do not publish the database with open rules such as `allow read, write: if true`.

FicVault stores each story in its own document under `users/{uid}/fics/{ficId}` and stores the ship list/archive metadata under `users/{uid}/vault/meta`. Profile details live in `users/{uid}`. This avoids putting the entire archive in one Firestore document, although a single unusually large fic can still exceed Firestore's per-document size limit.

## 3. Confirm the Firebase configuration

The supplied Firebase web configuration is already placed in `firebase.js`. The web API key is expected to be visible in a browser app; access to user data is enforced by Firebase Authentication and the Firestore rules. Do not add service-account credentials, Admin SDK private keys, or other secrets to this repository.

The original config contained a Google Analytics measurement ID. This version does **not** initialize Firebase Analytics, so that measurement ID is currently unused.

## 4. Publish on GitHub Pages

1. Create a GitHub repository for FicVault.
2. Upload the contents of this folder to the repository root (keep the files together; do not put the site files inside an extra nested folder).
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**, choose your main branch and `/ (root)`, then save.
5. Open the published `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/` address.

All page links are relative, so the app is designed to work from a GitHub Pages project URL as well as a custom domain. Add only the hostname (not the repository path) under Firebase Authentication's authorized domains.

## 5. Configure optional Google Drive / Docs sync

This integration is separate from Firebase sign-in and is not required for cloud archive sync.

1. Enable the Google Drive API in the Google Cloud project used for the Drive integration.
2. Create a Google OAuth 2.0 **Web application** client ID.
3. Add your GitHub Pages origin (for example `https://YOUR-USERNAME.github.io`) to **Authorized JavaScript origins**. Add `http://localhost:8000` for local testing if needed.
4. Open FicVault → **Settings** and paste the OAuth Client ID into the Google Drive section.
5. Use **Open FicVault Drive sync panel** to authorize Drive access when you want to create/update Google Docs.

FicVault requests the `drive.file` scope for the Drive integration. Users can use Firebase cloud sync without connecting Google Drive.

## 6. Existing local archive migration

When the first account signs in on a browser that still has the previous FicVault local archive **at the same website origin**, the app imports that old local archive into that account and merges it with any cloud archive. If both copies contain the same story ID, the version with the newer `updatedAt` value is kept; stories with different IDs are preserved.

Browser storage is isolated by website origin. If the old version and GitHub Pages version use different origins (for example, a custom domain versus `YOUR-USERNAME.github.io`), the new site cannot read the old site's localStorage automatically. In that case, open the old site, use its **JSON Backup** export, sign in to the new FicVault site, and import that backup using the existing **Import JSON Backup** tool in the writing studio.

The automatic old-key migration runs only once per browser profile. On the same origin, the first account that signs in receives the legacy archive. If you keep separate FicVault accounts on one shared browser, use a JSON backup to move data to the intended account rather than relying on the one-time migration.

## 7. Before making the repository public

- Replace `your-email@example.com` in `privacy.html` and `terms.html` with a real support address that you monitor.
- Review the Terms and Privacy Policy for your actual operator details and practices. They are editable templates, not legal advice.
- Check Firebase Authentication's email templates and authorized domains.
- Deploy and test `firestore.rules` before entering real writing.
- Test new registration, sign-in, password reset, profile edits, cloud sync, sign-out, and sign-in from a second browser/device.
- Download a JSON backup before migration and periodically afterward.

## Local testing

Serve this folder over HTTP rather than opening the HTML files directly. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Add `localhost` to Firebase Authentication's authorized domains. Browser modules and Firebase Authentication popups may not work correctly from a `file://` URL.
