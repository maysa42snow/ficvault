import {
  auth, db, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
  signOut, doc, getDoc, setDoc, collection, getDocs, serverTimestamp
} from './firebase.js';

const $ = id => document.getElementById(id);
let currentUser = null;
try { const savedPrefs = JSON.parse(localStorage.getItem('ficvault_ui_prefs_v1') || '{}'); document.documentElement.setAttribute('data-theme', savedPrefs.theme || 'light'); } catch { document.documentElement.setAttribute('data-theme', 'light'); }
function message(text, success = true) {
  const el = $('profile-message');
  el.textContent = text;
  el.className = `rounded-xl p-3 text-sm mb-5 ${success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
}
function initials(name, email) {
  const value = (name || email || 'F').trim();
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : value.slice(0, 2)).toUpperCase();
}
function setAvatar(user, name) {
  const avatar = $('avatar');
  avatar.replaceChildren();
  if (user.photoURL && /^https:\/\//i.test(user.photoURL)) {
    const img = document.createElement('img');
    img.src = user.photoURL;
    img.alt = 'Profile avatar';
    img.referrerPolicy = 'no-referrer';
    img.className = 'w-full h-full object-cover';
    img.onerror = () => { avatar.textContent = initials(name, user.email); };
    avatar.appendChild(img);
  } else avatar.textContent = initials(name, user.email);
}

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace('./login.html'); return; }
  currentUser = user;
  const ref = doc(db, 'users', user.uid);
  let profile = {};
  try { const snap = await getDoc(ref); if (snap.exists()) profile = snap.data(); }
  catch (error) { console.warn('Could not read profile metadata:', error); }

  const name = user.displayName || profile.displayName || 'Writer';
  $('display-name').value = name;
  $('photo-url').value = user.photoURL || profile.photoURL || '';
  $('bio').value = profile.bio || '';
  $('profile-name-preview').textContent = name;
  $('profile-email-preview').textContent = user.email || 'No email address';
  $('account-email').textContent = user.email || 'No email address';
  $('verification-state').textContent = user.emailVerified ? 'Email verified' : 'Email not verified yet';
  $('provider-label').textContent = user.providerData.some(item => item.providerId === 'google.com') ? 'Google account' : 'Email & password';
  setAvatar({ ...user, photoURL: user.photoURL || profile.photoURL }, name);

  try {
    const fics = await getDocs(collection(db, 'users', user.uid, 'fics'));
    let chapters = 0;
    fics.forEach(item => { chapters += Array.isArray(item.data().chapters) ? item.data().chapters.length : 0; });
    $('work-count').textContent = fics.size.toLocaleString();
    $('chapter-count').textContent = chapters.toLocaleString();
  } catch (error) {
    $('work-count').textContent = '—';
    $('chapter-count').textContent = '—';
  }
});

$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) return;
  const displayName = $('display-name').value.trim();
  const photoURL = $('photo-url').value.trim();
  const bio = $('bio').value.trim();
  if (!displayName) { message('Please enter a display name.', false); return; }
  if (photoURL && !/^https:\/\//i.test(photoURL)) { message('Avatar links must begin with https://.', false); return; }
  const button = event.submitter;
  button.disabled = true;
  try {
    await updateProfile(currentUser, { displayName, photoURL: photoURL || null });
    await setDoc(doc(db, 'users', currentUser.uid), {
      uid: currentUser.uid, email: currentUser.email || '', displayName,
      photoURL, bio, updatedAt: serverTimestamp()
    }, { merge: true });
    $('profile-name-preview').textContent = displayName;
    setAvatar({ ...currentUser, photoURL }, displayName);
    message('Your profile has been saved.');
  } catch (error) {
    console.error(error);
    message(error.message || 'The profile could not be saved.', false);
  } finally { button.disabled = false; }
});

$('reset-password').addEventListener('click', async () => {
  if (!currentUser?.email) return;
  try { await sendPasswordResetEmail(auth, currentUser.email); message('A password-reset email has been requested.'); }
  catch (error) { message(error.message || 'Could not request a password reset.', false); }
});
$('sign-out').addEventListener('click', async () => { await signOut(auth); location.replace('./login.html'); });
