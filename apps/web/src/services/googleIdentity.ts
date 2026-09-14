/**
 * Google Identity Services loader (the agreed D-11 exception — ~40 lines).
 * Renders the official Google button and hands the real id_token to
 * authService.googleAuth().
 */

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ||
  '354190554871-c313vjstblmkcoqk2ulqja9ed65fagp0.apps.googleusercontent.com';

let gsiPromise: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { google?: unknown }).google) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

interface GoogleCredentialResponse {
  credential: string;
}

/**
 * One Tap prompt wrapper: resolves with the id_token when the user picks an
 * account, rejects when dismissed/unavailable. Requires a registered
 * Authorized JavaScript origin (http://localhost:3000, http://localhost, …).
 */
export function promptGoogleSignIn(timeoutMs = 120000): Promise<string> {
  return new Promise((outerResolve, outerReject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    loadGoogleScript()
      .then(() => {
        const google = (window as unknown as {
          google?: {
            accounts: {
              id: {
                initialize: (cfg: {
                  client_id: string;
                  callback: (res: GoogleCredentialResponse) => void;
                  cancel_on_tap_outside?: boolean;
                }) => void;
                prompt: (listener?: (n: { isDismissed: () => boolean }) => void) => void;
              };
            };
          };
        }).google;
        if (!google) throw new Error('Google Identity Services unavailable');
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => done(() => outerResolve(res.credential)),
          cancel_on_tap_outside: true,
        });
        google.accounts.id.prompt((notification) => {
          if (notification.isDismissed()) {
            done(() => outerReject(new Error('Google sign-in dismissed')));
          }
        });
      })
      .catch((e) => done(() => outerReject(e)));

    setTimeout(
      () => done(() => outerReject(new Error('Google sign-in timed out'))),
      timeoutMs,
    );
  });
}

/**
 * Request an OAuth2 access token via a user-gesture popup. This flow is far
 * more reliable than One Tap prompt() on localhost (FedCM / third-party
 * cookie phase-out often silently suppresses the One Tap prompt, which is
 * what produced the "Google sign-in failed" dead-end). The backend verifies
 * the token and auto-creates the account on first sign-in.
 */
export function promptGoogleAccessToken(timeoutMs = 120000): Promise<string> {
  return new Promise((outerResolve, outerReject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    loadGoogleScript()
      .then(() => {
        const google = (window as unknown as {
          google?: {
            accounts: {
              oauth2: {
                initTokenClient: (cfg: {
                  client_id: string;
                  scope: string;
                  callback: (res: { access_token?: string; error?: string }) => void;
                }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
              };
            };
          };
        }).google;
        if (!google?.accounts?.oauth2) throw new Error('Google OAuth2 unavailable');
        const client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'openid email profile',
          callback: (res) => {
            if (res.access_token) done(() => outerResolve(res.access_token as string));
            else done(() => outerReject(new Error(res.error || 'Google sign-in dismissed')));
          },
        });
        client.requestAccessToken({ prompt: 'select_account' });
      })
      .catch((e) => done(() => outerReject(e)));

    setTimeout(
      () => done(() => outerReject(new Error('Google sign-in timed out'))),
      timeoutMs,
    );
  });
}

/**
 * Best-effort sign-in: try the silent One Tap credential first, fall back to
 * the popup access-token flow. Resolves with {idToken?, accessToken?} —
 * exactly one is always set.
 */
export async function promptGoogleCredential(): Promise<{ idToken?: string; accessToken?: string }> {
  try {
    const idToken = await promptGoogleSignIn(15000);
    if (idToken) return { idToken };
  } catch {
    /* One Tap unavailable/dismissed — fall through to the popup flow */
  }
  const accessToken = await promptGoogleAccessToken();
  return { accessToken };
}

export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (idToken: string) => void,
): Promise<void> {
  await loadGoogleScript();
  const google = (window as unknown as {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: GoogleCredentialResponse) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }).google;
  if (!google) throw new Error('Google Identity Services unavailable');
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (res) => onCredential(res.credential),
  });
  google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    width: 320,
    text: 'continue_with',
  });
}
