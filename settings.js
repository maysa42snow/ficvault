import {
  auth, db, onAuthStateChanged, sendPasswordResetEmail, signOut,
  collection, getDocs
} from './firebase.js';
import {
  getGoogleDriveStatus, beginGoogleDriveAuthorization, disconnectGoogleDrive
} from './drive-client.js';

const UI_PREFS_KEY = 'ficvault_ui_prefs_v1';
const DRIVE_SETTINGS_KEY = 'ficvault_drive_settings_v2';
const $ = id => document.getElementById(id);
let currentUser = null;
let prefs = { theme: 'light', viewMode: 'grid', sortBy: 'updated' };
let drivePrefs = { rootFolderName: 'FicVault Fanfics', createShipSubfolders: true, autoSync: true };
function showMessage(text, success = true) {
  const el = $('settings-message'); el.textContent = text;
  el.className = `rounded-xl p-3 text-sm mb-5 ${success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
}
function drivePrefsKey() { return `${DRIVE_SETTINGS_KEY}_${currentUser?.uid || 'guest'}`; }
function loadPrefs() {
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}') }; } catch {}
  document.documentElement.setAttribute('data-theme', prefs.theme || 'light');
  $('view-mode').value = prefs.viewMode || 'grid';
  $('sort-mode').value = prefs.sortBy || 'updated';
  document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    const active = btn.dataset.themeChoice === prefs.theme;
    btn.style.outline = active ? '2px solid var(--accent)' : 'none';
    btn.style.outlineOffset = '2px';
  });
}
function savePrefs() {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  document.documentElement.setAttribute('data-theme', prefs.theme);
  loadPrefs();
}
function readDriveSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(drivePrefsKey()) || localStorage.getItem(DRIVE_SETTINGS_KEY) || localStorage.getItem('ficvault_drive_settings_v1') || '{}');
    drivePrefs = { ...drivePrefs, ...saved };
    delete drivePrefs.clientId;
  } catch {}
  $('drive-folder').value = drivePrefs.rootFolderName || 'FicVault Fanfics';
  $('drive-subfolders').checked = drivePrefs.createShipSubfolders !== false;
  $('auto-drive-sync').checked = drivePrefs.autoSync !== false;
}
function saveDriveSettings() {
  drivePrefs = {
    rootFolderName: $('drive-folder').value.trim() || 'FicVault Fanfics',
    createShipSubfolders: $('drive-subfolders').checked,
    autoSync: $('auto-drive-sync').checked
  };
  localStorage.setItem(drivePrefsKey(), JSON.stringify(drivePrefs));
  showMessage('Google Docs preferences saved.');
}
function downloadBackup() {
  if (!currentUser) return;
  const key = `ficvault_data_v2_${currentUser.uid}`;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (!data) { showMessage('No browser archive copy was found yet. Open the writing studio to load your archive.', false); return; }
  const payload = { app: 'FicVault', version: 2, user: currentUser.uid, exportedAt: new Date().toISOString(), ...data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ficvault-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  showMessage('Your browser archive backup has been downloaded.');
}
async function refreshDriveStatus() {
  try {
    const status = await getGoogleDriveStatus();
    const connected = Boolean(status.connected);
    $('drive-status-dot').style.background = connected ? '#10b981' : '#d6a23a';
    $('drive-status-title').textContent = connected ? 'Google Drive is connected' : 'Google Drive is not connected';
    $('drive-status-copy').textContent = connected
      ? (drivePrefs.autoSync ? 'Your Docs will update automatically after you save changes in FicVault.' : 'Google Drive is connected, but automatic Docs sync is paused.')
      : 'Connect the Google account where you want FicVault to create and update your documents.';
    $('connect-drive').classList.toggle('hidden', connected);
    $('disconnect-drive').classList.toggle('hidden', !connected);
  } catch (error) {
    $('drive-status-title').textContent = 'Could not check Google Drive';
    $('drive-status-copy').textContent = error.message || 'Check that the Cloud Functions have been deployed.';
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace('./login.html'); return; }
  currentUser = user;
  $('cloud-email').textContent = user.email || 'Google account';
  loadPrefs(); readDriveSettings();
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'fics'));
    let chapters = 0;
    snapshot.forEach(item => { chapters += Array.isArray(item.data().chapters) ? item.data().chapters.length : 0; });
    $('cloud-count').textContent = `${snapshot.size.toLocaleString()} works · ${chapters.toLocaleString()} chapters in your cloud archive`;
  } catch (error) {
    $('cloud-count').textContent = 'Could not read the cloud archive. Check your Firestore setup and security rules.';
  }
  await refreshDriveStatus();
});

document.querySelectorAll('[data-theme-choice]').forEach(btn => btn.addEventListener('click', () => { prefs.theme = btn.dataset.themeChoice; savePrefs(); }));
$('view-mode').addEventListener('change', e => { prefs.viewMode = e.target.value; savePrefs(); });
$('sort-mode').addEventListener('change', e => { prefs.sortBy = e.target.value; savePrefs(); });
$('drive-folder').addEventListener('change', saveDriveSettings);
$('drive-subfolders').addEventListener('change', saveDriveSettings);
$('auto-drive-sync').addEventListener('change', saveDriveSettings);
$('connect-drive').addEventListener('click', async () => {
  try { await beginGoogleDriveAuthorization(); }
  catch (error) { showMessage(error.message || 'Could not connect Google Drive.', false); }
});
$('disconnect-drive').addEventListener('click', async () => {
  try {
    await disconnectGoogleDrive();
    await refreshDriveStatus();
    showMessage('Google Drive disconnected. Existing Google Docs remain in your Drive.');
  } catch (error) { showMessage(error.message || 'Could not disconnect Google Drive.', false); }
});
$('download-backup').addEventListener('click', downloadBackup);
$('password-reset').addEventListener('click', async () => {
  if (!currentUser?.email) return;
  try { await sendPasswordResetEmail(auth, currentUser.email); showMessage('A password-reset email has been requested.'); }
  catch (error) { showMessage(error.message || 'Could not request a password reset.', false); }
});
$('sign-out').addEventListener('click', async () => { await signOut(auth); location.replace('./login.html'); });
