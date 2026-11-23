'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { customerAuthApi, setToken, getToken, ApiError, type Customer } from './api';

// Customer auth state backed by the Express backend. The bearer token lives
// in localStorage via lib/api.ts (`gnanrudh-customer-token`); this module
// keeps a mirrored copy of the customer profile in localStorage so the UI
// can paint signed-in instantly while /me rehydrates on mount.
//
// signIn / signUp hit the backend. signOut clears both the token and the
// local profile. When /me returns 401 (stale token, deleted customer) we
// also sign out so the user isn't stuck in a half-authed state.

const STORAGE_KEY = 'tridha-user';

export type AuthUser = {
  name: string;
  email: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  dob?: string; // ISO yyyy-mm-dd
};

function fromCustomer(c: Customer): AuthUser {
  return {
    name: c.name,
    email: c.email || '',
    firstName: c.firstName || undefined,
    lastName: c.lastName || undefined,
    mobile: c.phone || undefined,
    dob: c.dob || undefined,
  };
}

type AuthContextValue = {
  user: AuthUser | null;
  hydrated: boolean;
  // Legacy entry point used by the UI during the local-only auth era.
  // Still accepted so pre-API flows don't break while they migrate.
  signIn: (user: AuthUser) => void;
  signInWithPassword: (email: string, password: string) => Promise<AuthUser>;
  signUp: (payload: {
    firstName: string;
    lastName?: string;
    email: string;
    mobile: string;
    password: string;
    dob?: string;
  }) => Promise<AuthUser>;
  signOut: () => void;
};

const Ctx = createContext<AuthContextValue | null>(null);

// Derive a friendly display name from an email when the user signs in
// without supplying one (sign-in form only asks for email + password).
// `john.doe@example.com` -> `John`.
export function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._-]/)[0] ?? local;
  if (!first) return 'Friend';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Paint-fast path: show the locally cached profile immediately on
    // mount so the "Account" link doesn't flash "Sign In" before /me
    // resolves. The real source of truth is still the backend.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed && typeof parsed.email === 'string') setUser(parsed);
      }
    } catch { /* ignore */ }

    // If we have a bearer token, verify it with /me. If it's stale or the
    // customer no longer exists, clear everything so the user re-signs in.
    if (getToken()) {
      customerAuthApi.me()
        .then(({ customer }) => {
          const next = fromCustomer(customer);
          setUser(next);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            setToken(null);
            setUser(null);
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
          }
        })
        .finally(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
  }, []);

  const persist = useCallback((next: AuthUser) => {
    setUser(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const signIn = useCallback((next: AuthUser) => {
    // Legacy no-API entry point — just mirrors into state. Real auth goes
    // through signInWithPassword / signUp which also set a token.
    persist(next);
  }, [persist]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { token, customer } = await customerAuthApi.login(email, password);
    setToken(token);
    const next = fromCustomer(customer);
    persist(next);
    return next;
  }, [persist]);

  const signUp = useCallback(async (payload: {
    firstName: string; lastName?: string; email: string; mobile: string; password: string; dob?: string;
  }) => {
    // Signup creates the account on the backend but does NOT auto-login.
    // The user is routed back to the sign-in form so they type the
    // password they just chose — standard pattern on most storefronts and
    // what House of GnanRudh asked for. The token returned by the API is
    // intentionally discarded here.
    const { customer } = await customerAuthApi.signup({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.mobile,
      password: payload.password,
      dob: payload.dob,
    });
    return fromCustomer(customer);
  }, []);

  const signOut = useCallback(() => {
    // Tell the backend first so it stamps tokenInvalidBefore and rejects
    // this token on any subsequent request (another tab, a leaked copy,
    // the token sitting in a browser extension, etc.). Fire-and-forget —
    // if the request fails the local clear still happens so the user is
    // never stuck "signed in" in the UI.
    if (getToken()) {
      customerAuthApi.logout().catch(() => { /* server will time-out tokens on its own */ });
    }
    setUser(null);
    setToken(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const value = useMemo(
    () => ({ user, hydrated, signIn, signInWithPassword, signUp, signOut }),
    [user, hydrated, signIn, signInWithPassword, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
