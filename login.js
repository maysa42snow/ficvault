import {
  auth, db, googleProvider, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail,
  sendEmailVerification, updateProfile, setDoc, doc, serverTimestamp
} from './firebase.js';

const $ = id => document.getElementById(id);
try { const savedPrefs = JSON.parse(localStorage.getItem('ficvault_ui_prefs_v1') || '{}'); document.documentElement.setAttribute('data-theme', savedPrefs.theme || 'light'); } catch { document.documentElement.setAttribute('data-theme', 'light'); }
let mode = 'signin';
let authActionInProgress = false;
$('year').textContent = new Date().getFullYear();

function showMessage(message, type = 'error') {
  const box = $('auth-message');
  box.textContent = message;
  box.className = `rounded-xl p-3 text-sm mb-5 ${type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
}
function clearMessage() { $('auth-message').className = 'hidden'; $('auth-message').textContent = ''; }
function explainError(error) {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'An account already exists with this email. Try signing in instead.',
    'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network connection failed. Check your connection and try again.'
  };
  return messages[error?.code] || error?.message || 'Something went wrong. Please try again.';
}
function setMode(next) {
  mode = next;
  const signingUp = mode === 'signup';
  $('form-heading').textContent = signingUp ? 'Create your account' : 'Sign in to your archive';
  $('form-subheading').textContent = signingUp ? 'A personal home for your writing and ideas.' : 'Pick up right where your last writing session ended.';
  $('name-field').classList.toggle('hidden', !signingUp);
  $('terms-field').classList.toggle('hidden', !signingUp);
  $('forgot-password').classList.toggle('hidden', signingUp);
  $('submit-auth').textContent = signingUp ? 'Create account' : 'Sign in';
  $('switch-copy').textContent = signingUp ? 'Already have an account?' : 'New to FicVault?';
  $('switch-mode').textContent = signingUp ? 'Sign in' : 'Create an account';
  $('password').autocomplete = signingUp ? 'new-password' : 'current-password';
  $('password').value = '';
  clearMessage();
}
$('switch-mode').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));

async function ensureProfile(user) {
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

onAuthStateChanged(auth, user => {
  if (user && !authActionInProgress) location.replace('./index.html');
});

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const email = $('email').value.trim();
  const password = $('password').value;
  const button = $('submit-auth');
  button.disabled = true;
  authActionInProgress = true;
  button.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    if (mode === 'signup') {
      const displayName = $('display-name').value.trim();
      if (!displayName) throw new Error('Please enter a display name.');
      if (!$('accept-terms').checked) throw new Error('Please agree to the Terms of Service before creating an account.');
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      try { await ensureProfile(credential.user); } catch (profileError) { console.warn('Profile document will be created on the next visit.', profileError); }
      try { await sendEmailVerification(credential.user); } catch (verificationError) { console.warn('Verification email could not be sent.', verificationError); }
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    location.replace('./index.html');
  } catch (error) {
    authActionInProgress = false;
    showMessage(explainError(error));
    button.disabled = false;
    button.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  }
});

$('google-signin').addEventListener('click', async () => {
  clearMessage();
  const button = $('google-signin');
  button.disabled = true;
  authActionInProgress = true;
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    try { await ensureProfile(credential.user); } catch (error) { console.warn('Profile document will be created on the next visit.', error); }
    location.replace('./index.html');
  } catch (error) {
    authActionInProgress = false;
    showMessage(explainError(error));
    button.disabled = false;
  }
});

$('forgot-password').addEventListener('click', async () => {
  clearMessage();
  const email = $('email').value.trim();
  if (!email) {
    showMessage('Enter your email address first, then choose “Forgot password?”.');
    $('email').focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage('If an account uses this address, a password-reset email has been sent.', 'success');
  } catch (error) {
    showMessage(explainError(error));
  }
});
