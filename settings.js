import {
  auth, db, onAuthStateChanged, sendPasswordResetEmail, signOut,
  collection, getDocs
} from './firebase.js';

const UI_PREFS_KEY = 'ficvault_ui_prefs_v1';
const DRIVE_SETTINGS_KEY = 'ficvault_drive_settings_v1';
const $ = id => document.getElementById(id);
let currentUser = null;
let prefs = { theme: 'light', viewMode: 'grid', sortBy: 'updated' };
function showMessage(text, success = true) {
  const el = $('settings-message'); el.textContent = text;
  el.className = `rounded-xl p-3 text-sm mb-5 ${success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
}
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
  let drive = {};
  try { drive = JSON.parse(localStorage.getItem(DRIVE_SETTINGS_KEY) || '{}'); } catch {}
  $('drive-client-id').value = drive.clientId || '';
  $('drive-folder').value = drive.rootFolderName || 'FicVault Fanfics';
  $('drive-subfolders').checked = drive.createShipSubfolders !== false;
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
});

document.querySelectorAll('[data-theme-choice]').forEach(btn => btn.addEventListener('click', () => { prefs.theme = btn.dataset.themeChoice; savePrefs(); }));
$('view-mode').addEventListener('change', e => { prefs.viewMode = e.target.value; savePrefs(); });
$('sort-mode').addEventListener('change', e => { prefs.sortBy = e.target.value; savePrefs(); });
$('save-drive').addEventListener('click', () => {
  const settings = {
    clientId: $('drive-client-id').value.trim(),
    rootFolderName: $('drive-folder').value.trim() || 'FicVault Fanfics',
    createShipSubfolders: $('drive-subfolders').checked
  };
  localStorage.setItem(DRIVE_SETTINGS_KEY, JSON.stringify(settings));
  showMessage('Google Drive settings saved in this browser.');
});
$('download-backup').addEventListener('click', downloadBackup);
$('password-reset').addEventListener('click', async () => {
  if (!currentUser?.email) return;
  try { await sendPasswordResetEmail(auth, currentUser.email); showMessage('A password-reset email has been requested.'); }
  catch (error) { showMessage(error.message || 'Could not request a password reset.', false); }
});
$('sign-out').addEventListener('click', async () => { await signOut(auth); location.replace('./login.html'); });
