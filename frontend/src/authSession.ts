export const DEMO_NAME = 'Alex Morgan';
export const DEMO_EMAIL = 'alex.morgan@chillpath.demo';
export const DEMO_PASSWORD = 'ABCD 1234';
const SESSION_KEY = 'chillpath_demo_identity';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type SessionIdentity = {
  name: string;
  email?: string;
  organizationId?: string;
  organizationName: string;
  kind: 'demo' | 'account';
  signedInAt: number;
};

export function readSessionIdentity(): SessionIdentity | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const identity = JSON.parse(raw) as Partial<SessionIdentity>;
    if (
      typeof identity.name !== 'string' || !identity.name.trim() ||
      typeof identity.organizationName !== 'string' || !identity.organizationName.trim() ||
      (identity.kind !== 'demo' && identity.kind !== 'account') ||
      typeof identity.signedInAt !== 'number' ||
      identity.signedInAt > Date.now() ||
      Date.now() - identity.signedInAt > SESSION_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return identity as SessionIdentity;
  } catch {
    return null;
  }
}

function saveSessionIdentity(identity: SessionIdentity): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
}

export function signInDemo(email: string, password: string): boolean {
  if (email.trim().toLocaleLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return false;
  }
  saveSessionIdentity({
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    organizationName: 'ChillPath Demo',
    kind: 'demo',
    signedInAt: Date.now(),
  });
  return true;
}

export function signInAccount(email: string, organizationName: string | null, organizationId?: string | null): void {
  const accountName = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  saveSessionIdentity({
    name: accountName ? accountName.replace(/\b\w/g, letter => letter.toUpperCase()) : email,
    email,
    organizationId: organizationId ?? undefined,
    organizationName: organizationName?.trim() || 'ChillPath workspace',
    kind: 'account',
    signedInAt: Date.now(),
  });
}

export function signOut(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
