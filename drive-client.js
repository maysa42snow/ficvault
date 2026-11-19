// Browser interface for the secure, server-managed Google Drive integration.
import { functions } from './firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';

const call = name => httpsCallable(functions, name);

function explainCallableError(error, functionName) {
  // Keep the complete SDK error in DevTools so the underlying failure can be
  // correlated with Cloud Functions logs. Never display secrets or raw tokens.
  console.error(`[FicVault Drive] ${functionName} failed`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    cause: error?.cause
  });

  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '');

  if (code === 'functions/internal' && /internal\s*\[0\]/i.test(message)) {
    return new Error(
      'FicVault did not receive a response from its Google Drive service. This usually means the Cloud Function is not deployed, the project/region is mismatched, or the request was blocked by the network or browser. Check that startGoogleDriveAuthorization is deployed in us-central1, then check its Firebase Functions logs. Your FicVault stories have not been deleted.'
    );
  }

  if (code === 'functions/internal') {
    return new Error(
      'FicVault’s Google Drive service returned an internal error. Check the startGoogleDriveAuthorization logs in Firebase Console → Functions, and confirm the Google OAuth secrets are configured.'
    );
  }

  if (code === 'functions/unauthenticated') {
    return new Error('Your FicVault session expired. Sign in again, then reconnect Google Drive.');
  }

  if (code === 'functions/not-found' || code === 'functions/unavailable') {
    return new Error('The Google Drive service is unavailable. Confirm that the Cloud Functions have been deployed to us-central1 and try again.');
  }

  return new Error(message || `Could not contact ${functionName}. Check your connection and Firebase deployment.`);
}

async function invoke(callable, functionName, payload) {
  try {
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw explainCallableError(error, functionName);
  }
}
const startAuthorizationCall = call('startGoogleDriveAuthorization');
const getStatusCall = call('getGoogleDriveStatus');
const disconnectCall = call('disconnectGoogleDrive');
const syncDocCall = call('syncGoogleDoc');

export async function getGoogleDriveStatus() {
  return (await invoke(getStatusCall, 'getGoogleDriveStatus')) || { connected: false };
}

export async function beginGoogleDriveAuthorization() {
  const data = await invoke(startAuthorizationCall, 'startGoogleDriveAuthorization');
  const url = data?.authorizationUrl;
  if (!url) throw new Error('FicVault could not start Google authorization. The function returned no authorization URL. Check its Firebase logs.');
  // A full-page redirect avoids popup blockers and lets Google's authorization
  // code reach the secure Cloud Function callback.
  window.location.assign(url);
}

export async function disconnectGoogleDrive() {
  return invoke(disconnectCall, 'disconnectGoogleDrive');
}

export async function syncGoogleDoc(payload) {
  return invoke(syncDocCall, 'syncGoogleDoc', payload);
}

// The original writing studio is a classic inline script, so expose a tiny
// promise-based API to it without moving the editor into a build system.
window.FicVaultDrive = {
  getStatus: getGoogleDriveStatus,
  connect: beginGoogleDriveAuthorization,
  disconnect: disconnectGoogleDrive,
  syncFic: syncGoogleDoc
};
