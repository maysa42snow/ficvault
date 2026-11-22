# Google Drive setup (browser-based)

This version uses Google Identity Services + Google Drive API directly from the GitHub Pages site. It does **not** use Firebase Cloud Functions and does not require the Blaze plan.

## 1. Create a Web OAuth client

In Google Cloud Console for the FicVault project:

- Enable **Google Drive API**.
- Configure the OAuth consent screen.
- Create an OAuth client of type **Web application**.
- Add the exact GitHub Pages/custom-domain origin to **Authorized JavaScript origins**.

The client ID is not a password. It is safe to include in frontend JavaScript.

## 2. Put the client ID in FicVault

Open `drive-client.js` and replace:

`YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com`

with the Web application's client ID.

Users will then only see **Connect Google Drive**. They do not need to enter a client ID.

## 3. Drive permission

FicVault requests only `https://www.googleapis.com/auth/drive.file`. The user still has to approve access to Google once. Google controls that consent screen.

## 4. Automatic sync

After connection, FicVault automatically creates/updates native Google Docs after changes are saved. The browser must be open/online for an immediate sync. On a later visit, FicVault attempts a silent authorization if the user previously approved the app.

Changes made directly in Google Docs are not imported. If the Doc's modification time changed outside FicVault, automatic replacement is paused for that work instead of overwriting the external edit.
