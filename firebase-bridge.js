// Auth gate + local-first / Firestore sync bridge for the original FicVault app.
import {
  auth, db, onAuthStateChanged, signOut, doc, getDoc, setDoc, collection,
  getDocs, writeBatch
} from './firebase.js';

const LEGACY_KEY = 'ficvault_data_v1';
const LEGACY_MIGRATED_KEY = 'ficvault_legacy_imported_v2';
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const stable = (value) => JSON.stringify(value ?? null);

function setStatus(status, message = '') {
  window.dispatchEvent(new CustomEvent('ficvault:sync-status', { detail: { status, message } }));
}

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn(`FicVault could not read ${key}`, error);
    return null;
  }
}

function mergeVault(remote, local) {
  if (!remote) return clone(local);
  if (!local) return clone(remote);

  const ships = clone(remote.ships || []);
  const localShipIdMap = new Map();
  for (const ship of (local.ships || [])) {
    const match = ships.find(item => item.id === ship.id ||
      (item.name || '').trim().toLowerCase() === (ship.name || '').trim().toLowerCase());
    if (match) localShipIdMap.set(ship.id, match.id);
    else {
      ships.push(clone(ship));
      localShipIdMap.set(ship.id, ship.id);
    }
  }

  const ficMap = new Map((remote.fics || []).map(fic => [fic.id, clone(fic)]));
  for (const localFic of (local.fics || [])) {
    const candidate = clone(localFic);
    candidate.shipIds = (candidate.shipIds || []).map(id => localShipIdMap.get(id) || id);
    const previous = ficMap.get(candidate.id);
    if (!previous || Number(candidate.updatedAt || 0) >= Number(previous.updatedAt || 0)) {
      ficMap.set(candidate.id, candidate);
    }
  }

  return {
    ships,
    fics: [...ficMap.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    sampleBannerDismissed: Boolean(remote.sampleBannerDismissed || local.sampleBannerDismissed)
  };
}

function serializeMeta(state) {
  return {
    ships: state.ships || [],
    sampleBannerDismissed: Boolean(state.sampleBannerDismissed),
    schemaVersion: 2
  };
}

async function loadRemoteVault(uid) {
  const userRef = doc(db, 'users', uid);
  const metaRef = doc(db, 'users', uid, 'vault', 'meta');
  const [profileSnap, metaSnap, ficsSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(metaRef),
    getDocs(collection(db, 'users', uid, 'fics'))
  ]);
  const fics = ficsSnap.docs.map(item => ({ ...item.data(), id: item.id }));
  const meta = metaSnap.exists() ? metaSnap.data() : {};
  const hasVault = metaSnap.exists() || fics.length > 0;
  return {
    profile: profileSnap.exists() ? profileSnap.data() : null,
    hasVault,
    state: hasVault ? {
      ships: Array.isArray(meta.ships) ? meta.ships : [],
      fics,
      sampleBannerDismissed: Boolean(meta.sampleBannerDismissed)
    } : null
  };
}

function makeCloudWriter(uid, initialRemoteState) {
  let lastSynced = clone(initialRemoteState || { ships: [], fics: [], sampleBannerDismissed: false });
  let timer = null;
  let pending = null;
  let retrySnapshot = null;
  let writing = false;
  let cloudEnabled = true;

  async function commitSnapshot(snapshot) {
    if (!cloudEnabled || !snapshot) return;
    if (writing) {
      pending = clone(snapshot);
      return;
    }
    writing = true;
    setStatus('syncing', 'Saving changes to your FicVault account…');

    try {
      const previousFics = new Map((lastSynced.fics || []).map(fic => [fic.id, fic]));
      const currentFics = new Map((snapshot.fics || []).map(fic => [fic.id, fic]));
      const operations = [];

      for (const [id, fic] of currentFics) {
        if (stable(previousFics.get(id)) !== stable(fic)) {
          operations.push({ type: 'set', ref: doc(db, 'users', uid, 'fics', id), data: clone(fic) });
        }
      }
      for (const id of previousFics.keys()) {
        if (!currentFics.has(id)) {
          operations.push({ type: 'delete', ref: doc(db, 'users', uid, 'fics', id) });
        }
      }

      const oldMeta = serializeMeta(lastSynced);
      const newMeta = serializeMeta(snapshot);
      if (stable(oldMeta) !== stable(newMeta) || !lastSynced) {
        operations.push({
          type: 'set',
          ref: doc(db, 'users', uid, 'vault', 'meta'),
          data: { ...newMeta, updatedAt: Date.now() }
        });
      }

      // Stay below Firestore's 500-write batch limit.
      for (let i = 0; i < operations.length; i += 450) {
        const batch = writeBatch(db);
        for (const operation of operations.slice(i, i + 450)) {
          if (operation.type === 'delete') batch.delete(operation.ref);
          else batch.set(operation.ref, operation.data);
        }
        await batch.commit();
      }

      lastSynced = clone(snapshot);
      retrySnapshot = null;
      setStatus('synced', `Saved just now · ${(snapshot.fics || []).length} works in your account`);
    } catch (error) {
      console.error('FicVault cloud save failed:', error);
      retrySnapshot = clone(snapshot);
      setStatus('error', error?.message || 'Cloud sync failed. Your local copy is still saved.');
    } finally {
      writing = false;
      if (pending) {
        const next = pending;
        pending = null;
        await commitSnapshot(next);
      }
    }
  }

  window.addEventListener('online', () => {
    if (retrySnapshot && cloudEnabled && !writing) {
      const next = retrySnapshot;
      retrySnapshot = null;
      commitSnapshot(next);
    }
  });

  return {
    schedule(snapshot) {
      pending = clone(snapshot);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = pending;
        pending = null;
        commitSnapshot(next);
      }, 1200);
    },
    async syncNow(snapshot) {
      clearTimeout(timer);
      pending = null;
      await commitSnapshot(clone(snapshot));
    },
    disable() { cloudEnabled = false; clearTimeout(timer); }
  };
}

let readyResolve;
window.ficvaultFirebaseReady = new Promise(resolve => { readyResolve = resolve; });

let handledUid = null;
onAuthStateChanged(auth, async user => {
  if (!user) {
    setStatus('signed-out', 'Please sign in to open your archive.');
    if (!location.pathname.endsWith('/login.html') && !location.pathname.endsWith('login.html')) {
      location.replace('./login.html');
    }
    readyResolve(false);
    return;
  }

  if (handledUid === user.uid) return;
  handledUid = user.uid;

  try {
    const storageKey = `ficvault_data_v2_${user.uid}`;
    let localState = readJson(storageKey);
    if (!localState && !localStorage.getItem(LEGACY_MIGRATED_KEY)) {
      localState = readJson(LEGACY_KEY);
      if (localState) localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
    }

    let remote;
    let remoteLoadError = null;
    try {
      remote = await loadRemoteVault(user.uid);
    } catch (error) {
      remoteLoadError = error;
      console.error('FicVault could not load the cloud archive:', error);
      remote = { profile: null, hasVault: false, state: null };
    }

    const merged = mergeVault(remote.state, localState);
    if (merged) localStorage.setItem(storageKey, JSON.stringify(merged));

    const cloudWriter = makeCloudWriter(user.uid, remote.state);
    window.FicVaultFirebase = {
      user,
      storageKey,
      bootstrapData: merged,
      // Allow the writer to try even after a temporary read failure. Failed writes
      // are retained locally and retried when the browser comes back online.
      cloudAvailable: true,
      profile: remote.profile,
      scheduleSave: snapshot => cloudWriter.schedule(snapshot),
      syncNow: snapshot => cloudWriter.syncNow(snapshot),
      disableCloud: () => cloudWriter.disable()
    };

    if (remoteLoadError) {
      setStatus('error', 'Cloud storage could not be reached. Your browser copy is safe; FicVault will retry when the connection returns.');
    } else {
      setStatus('synced', remote.hasVault ? 'Your cloud archive is ready.' : 'Your account is ready. Your archive will sync automatically.');
    }
    // Migrate local-only edits, or retry a first write after a temporary read failure.
    cloudWriter.schedule(merged || { ships: [], fics: [], sampleBannerDismissed: false });

    window.dispatchEvent(new CustomEvent('ficvault:user-ready', { detail: { user } }));
    readyResolve(true);
  } catch (error) {
    console.error('FicVault account initialization failed:', error);
    window.FicVaultFirebase = {
      user,
      storageKey: `ficvault_data_v2_${user.uid}`,
      bootstrapData: null,
      cloudAvailable: false,
      scheduleSave: () => {},
      syncNow: async () => {},
      disableCloud: () => {}
    };
    setStatus('error', 'Account loaded, but cloud setup needs attention. Your browser copy remains available.');
    readyResolve(true);
  }
});

window.ficvaultSignOut = async () => {
  await signOut(auth);
  location.replace('./login.html');
};
