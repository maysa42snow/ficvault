# FicVault — GitHub Pages + Firebase + automatic Google Docs sync

This version keeps FicVault static on GitHub Pages, uses Firebase for account/profile/archive data, and uses the Google Drive API directly from the browser for Google Docs sync. **Firebase Cloud Functions are not required.**

## What's included

- `index.html` — FicVault writing studio with per-account archive storage and automatic Google Docs updates after saves.
- `login.html`, `profile.html`, `settings.html` — authentication, profile, and account settings.
- `firebase.js` — Firebase web configuration.
- `firebase-bridge.js` — authenticated per-user archive loading and Firestore sync.
- `drive-client.js` — Google Identity Services + Google Drive API integration.
- `firestore.rules` — per-user archive rules.
- `privacy.html`, `terms.html` — policy pages.
- `GOOGLE_DRIVE_SETUP.md` — exact Google Cloud setup steps.

## Google Drive / Google Docs architecture

1. A signed-in FicVault user chooses **Connect Google Drive** once and approves Google's `drive.file` permission.
2. Google Identity Services gives the browser a short-lived access token.
3. The browser calls the Google Drive API directly. No Firebase Cloud Function, OAuth refresh-token database, or paid Firebase plan is needed.
4. When a story is saved, FicVault waits briefly and automatically creates or updates its native Google Doc.
5. FicVault stores the Doc ID and last modified time in the user's FicVault archive. If the Doc was edited outside FicVault, automatic replacement pauses for that work rather than overwriting the external edit.

This is **one-way sync: FicVault → Google Docs**. Changes made directly in Google Docs are not imported into the FicVault editor.

The browser must be open and online for an immediate automatic update. On a later visit, FicVault can attempt silent Google reauthorization if the user previously granted access. Google may still show consent again when its authorization state requires it.

## Firebase setup

1. Open Firebase Console and select `my-ficvault`.
2. Enable **Email/Password** and **Google** under Authentication → Sign-in method.
3. Add the GitHub Pages hostname/custom domain under Authentication → Settings → Authorized domains.
4. Create Firestore.
5. Publish `firestore.rules`.

FicVault stores stories under the authenticated user's UID. Browser clients are denied access to other users' records.

## Google Cloud setup

These steps are for the FicVault owner/developer, not for each user.

1. Open Google Cloud Console and select the project used by FicVault.
2. Enable **Google Drive API**.
3. Configure the Google Auth Platform / OAuth consent screen.
4. Create an OAuth 2.0 Client ID with application type **Web application**.
5. Add the exact website origins where FicVault will run to **Authorized JavaScript origins**, for example your GitHub Pages custom domain.
6. Open `drive-client.js` and replace `YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` with that Web Client ID.

The OAuth client ID is not a password and can be included in frontend JavaScript. Do **not** put a client secret in the repository; this browser-based flow does not need one.

FicVault requests only:

`https://www.googleapis.com/auth/drive.file`

This lets the app create and manage the files it creates or opens for this integration, rather than requesting unrestricted Drive access.

## OAuth verification / custom domain

For a public launch, follow Google's current OAuth verification requirements for your chosen scopes and app configuration. A custom domain is useful because you can verify ownership of the website in Google Search Console and use the same controlled domain in your OAuth configuration.

The GitHub Pages site can continue to host the app for free; the custom domain only changes the public address.

## Automatic sync behavior

- New eligible stories are created as native Google Docs automatically.
- Saved changes are pushed after a short debounce.
- The app records the Google Doc's `modifiedTime`.
- If Google Docs was changed outside FicVault, the app pauses that work instead of silently overwriting it.
- The existing manual sync button is retained only as a conflict-resolution action.
- Disconnecting Google Drive does not delete existing Google Docs.

## Important limitation

Because this is a browser-only OAuth integration, FicVault cannot perform Drive synchronization while the website is completely closed. This avoids storing long-lived Google credentials on a server and keeps the project compatible with GitHub Pages and Firebase's free plan.

## Deploying to GitHub Pages

Upload the contents of this folder to your repository and enable GitHub Pages for the branch/folder containing these files. Make sure the deployed URL is one of the authorized JavaScript origins in Google Cloud.
