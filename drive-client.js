// Browser interface for the secure, server-managed Google Drive integration.
import { functions } from './firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';

const call = name => httpsCallable(functions, name);
const startAuthorizationCall = call('startGoogleDriveAuthorization');
const getStatusCall = call('getGoogleDriveStatus');
const disconnectCall = call('disconnectGoogleDrive');
const syncDocCall = call('syncGoogleDoc');

export async function getGoogleDriveStatus() {
  const result = await getStatusCall();
  return result.data || { connected: false };
}

export async function beginGoogleDriveAuthorization() {
  const result = await startAuthorizationCall();
  const url = result.data?.authorizationUrl;
  if (!url) throw new Error('FicVault could not start Google authorization.');
  // A full-page redirect avoids popup blockers and lets Google's authorization
  // code reach the secure Cloud Function callback.
  window.location.assign(url);
}

export async function disconnectGoogleDrive() {
  const result = await disconnectCall();
  return result.data;
}

export async function syncGoogleDoc(payload) {
  const result = await syncDocCall(payload);
  return result.data;
}

// The original writing studio is a classic inline script, so expose a tiny
// promise-based API to it without moving the editor into a build system.
window.FicVaultDrive = {
  getStatus: getGoogleDriveStatus,
  connect: beginGoogleDriveAuthorization,
  disconnect: disconnectGoogleDrive,
  syncFic: syncGoogleDoc
};
