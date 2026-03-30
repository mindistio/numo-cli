import * as crypto from 'crypto';
import { http } from '../lib/http';
import pc from 'picocolors';
import { Errors } from '../lib/errors';
import { findFreePort, serveHtmlAndWaitForCallback } from './local-server';
import { getFirebaseApiKey, getFirebaseProjectId, getFirebaseAppId } from '../lib/config';
import { promptText } from '../lib/prompts';
import type { AuthResult } from './login';

/**
 * Browser page that sends SMS via Firebase JS SDK (handles reCAPTCHA internally)
 * and returns verificationId to CLI via localhost callback.
 */
function buildSmsPageHtml(
  apiKey: string,
  projectId: string,
  appId: string,
  phoneNumber: string,
  callbackUrl: string,
  state: string,
): string {
  const configJson = JSON.stringify({ apiKey, projectId, appId, phoneNumber, callbackUrl, state });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Numo — Sending SMS</title>
  <style>
    body { font-family: sans-serif; max-width: 420px; margin: 80px auto; padding: 20px; text-align: center; }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid #ccc; border-top-color: #4285f4; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #d32f2f; font-size: 14px; margin-top: 16px; }
    .success { color: #2e7d32; }
  </style>
</head>
<body>
  <h2>Numo</h2>
  <p id="status"><span class="spinner"></span> Sending SMS...</p>
  <p id="error" class="error"></p>

  <div id="recaptcha-container"></div>

  <script>window.__NUMO__ = ${configJson};</script>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
    import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

    const cfg = window.__NUMO__;
    const app = initializeApp({
      apiKey: cfg.apiKey,
      projectId: cfg.projectId,
      appId: cfg.appId,
      authDomain: cfg.projectId + '.firebaseapp.com',
    });
    const auth = getAuth(app);

    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      const confirmationResult = await signInWithPhoneNumber(auth, cfg.phoneNumber, verifier);

      const params = new URLSearchParams({ verificationId: confirmationResult.verificationId, state: cfg.state });
      document.getElementById('status').innerHTML = '<span class="success">SMS sent! Return to the terminal to enter the code.</span>';
      window.location.href = cfg.callbackUrl + '?' + params.toString();
    } catch (e) {
      document.getElementById('status').textContent = '';
      document.getElementById('error').textContent = e.message;
    }
  </script>
</body>
</html>`;
}

export async function authenticateWithPhone(spinner: { start: (msg?: string) => void; stop: (msg?: string) => void }): Promise<AuthResult> {
  const fbApiKey = getFirebaseApiKey();
  const projectId = getFirebaseProjectId();
  const appId = getFirebaseAppId();

  if (!fbApiKey) {
    throw Errors.configMissing('NUMO_FIREBASE_API_KEY');
  }
  if (!projectId) {
    throw Errors.configMissing('NUMO_FIREBASE_PROJECT_ID');
  }
  if (!appId) {
    throw Errors.configMissing('NUMO_FIREBASE_APP_ID');
  }

  const p = await import('@clack/prompts');

  const phone = await promptText({
    message: 'Phone number (with country code)',
    placeholder: '+380501234567',
    required: true,
  });

  if (!/^\+[0-9]{7,15}$/.test(phone)) {
    throw Errors.invalidInput('Invalid phone number. Use E.164 format: +<country code><number>', 'Example: +380501234567');
  }

  const port = await findFreePort();
  const callbackUrl = `http://localhost:${port}/callback`;
  const state = crypto.randomUUID();
  const html = buildSmsPageHtml(fbApiKey, projectId, appId, phone, callbackUrl, state);

  p.log.info('Opening browser to send SMS...');
  p.log.info(pc.dim(`If the browser does not open, visit: http://localhost:${port}`));

  const { default: open } = await import('open');
  const cp = await open(`http://localhost:${port}`);
  cp.unref();

  const callbackParams = await serveHtmlAndWaitForCallback(port, html, state);
  const verificationId = callbackParams.verificationId;

  if (!verificationId) {
    throw Errors.networkError('Failed to send SMS. Try again.');
  }

  p.log.success('SMS sent');

  const otp = await promptText({
    message: 'Enter the 6-digit code from SMS',
    placeholder: '123456',
    required: true,
  });

  spinner.start('Verifying code...');

  const resp = await http.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${fbApiKey}`,
    { sessionInfo: verificationId, code: otp }
  );

  const { refreshToken, localId: uid, idToken, phoneNumber } = resp.data;

  if (!refreshToken || !uid) {
    throw new Error('Incomplete credentials received');
  }

  return {
    refreshToken,
    uid,
    displayName: phoneNumber || phone,
    idToken,
    idTokenExpiry: idToken ? Date.now() + 3600 * 1000 : undefined,
  };
}
