'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { customerAuthApi, getToken, type Customer } from './api';
import { useAuth } from './auth';

export type Address = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export type AddressInput = Omit<Address, 'id'>;

type AddressState = {
  addresses: Address[];
  selectedId: string | null;
};

type AddressContextValue = AddressState & {
  hydrated: boolean;
  selected: Address | null;

  // Modal
  modalOpen: boolean;
  modalNextRoute: string | null;
  openAddressModal: (nextRoute?: string) => void;
  closeAddressModal: () => void;

  // Data
  addAddress: (input: AddressInput) => Address;
  updateAddress: (id: string, patch: Partial<AddressInput>) => void;
  removeAddress: (id: string) => void;
  selectAddress: (id: string) => void;
};

const STORAGE_KEY = 'gnanrudh-addresses-v1';
const Ctx = createContext<AddressContextValue | null>(null);

function readStorage(): AddressState {
  if (typeof window === 'undefined') return { addresses: [], selectedId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { addresses: [], selectedId: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { addresses: [], selectedId: null };
    return {
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      selectedId: typeof parsed.selectedId === 'string' ? parsed.selectedId : null,
    };
  } catch {
    return { addresses: [], selectedId: null };
  }
}

let nextId = 0;
const genId = () => {
  nextId += 1;
  return `addr-${Date.now().toString(36)}-${nextId}`;
};

export function AddressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AddressState>({ addresses: [], selectedId: null });
  const [hydrated, setHydrated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalNextRoute, setModalNextRoute] = useState<string | null>(null);

  // Hydrate from localStorage once on mount so the UI paints instantly.
  useEffect(() => {
    setState(readStorage());
    setHydrated(true);
  }, []);

  // Self-heal selection: whenever the address list changes, make sure the
  // selectedId still points at a real address. If it's null or stale, fall
  // back to the first entry. Guarantees that any consumer (checkout,
  // account page, address modal) always sees a valid `selected` whenever
  // the book has anything in it — no "pick an address" dead-end.
  useEffect(() => {
    if (!state.addresses.length) return;
    const stillValid = state.selectedId && state.addresses.some((a) => a.id === state.selectedId);
    if (stillValid) return;
    setState((s) => ({ ...s, selectedId: s.addresses[0]?.id ?? null }));
  }, [state.addresses, state.selectedId]);

  // Sign-in sync: when the customer is signed in, pull the server's book,
  // union it with whatever was added locally (so pre-sign-in addresses
  // don't vanish), and push the local-only rows up so the server catches
  // up. Guarded by a per-session ref so it runs once per sign-in; on
  // sign-out the ref resets so the next sign-in merges again.
  const { user, hydrated: authHydrated } = useAuth();
  const didSyncRef = useRef(false);
  const signedInEmail = user?.email || null;
  useEffect(() => {
    if (!hydrated || !authHydrated) return;
    if (!signedInEmail) {
      didSyncRef.current = false;
      return;
    }
    if (didSyncRef.current) return;
    didSyncRef.current = true;
    customerAuthApi.listAddresses()
      .then(({ items }) => {
        const serverIds = new Set(items.map((i) => i.id));
        setState((prev) => {
          const byId = new Map<string, Address>();
          // Local first so the server copy wins on collision.
          for (const a of prev.addresses) byId.set(a.id, a);
          for (const a of items.map(fromServerAddress)) byId.set(a.id, a);
          const addresses = Array.from(byId.values());
          // Push local-only rows (ids not yet on the server) so the
          // account catches up on first sign-in.
          for (const a of prev.addresses) {
            if (!serverIds.has(a.id)) {
              customerAuthApi.addAddress(toServerAddress(a)).catch(() => {});
            }
          }
          const serverDefault = items.find((i) => i.isDefault);
          const selectedId = prev.selectedId || serverDefault?.id || addresses[0]?.id || null;
          return { addresses, selectedId };
        });
      })
      .catch(() => { didSyncRef.current = false; });
  }, [hydrated, authHydrated, signedInEmail]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage full / disabled — silent
    }
  }, [state, hydrated]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openAddressModal = useCallback((nextRoute?: string) => {
    setModalNextRoute(nextRoute ?? null);
    setModalOpen(true);
  }, []);

  const closeAddressModal = useCallback(() => {
    setModalOpen(false);
    setModalNextRoute(null);
  }, []);

  const addAddress = useCallback((input: AddressInput) => {
    const next: Address = { ...input, id: genId() };
    setState((s) => ({
      addresses: [...s.addresses, next],
      selectedId: next.id,
    }));
    // Mirror to server for signed-in users. The locally-generated id stays
    // in state; the next refresh will reconcile with the server's id.
    if (getToken()) {
      customerAuthApi.addAddress(toServerAddress(next)).catch((err) => {
        console.warn('[addresses] server add failed:', err?.message || err);
      });
    }
    return next;
  }, []);

  const updateAddress = useCallback((id: string, patch: Partial<AddressInput>) => {
    setState((s) => ({
      ...s,
      addresses: s.addresses.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    if (getToken()) {
      // Only addresses that came from the server have ids the server
      // recognises. Locally-generated addresses (addr-xxx) get sent as
      // new creates — server dedupes on exact field match-of-interest
      // later if needed; for now, best-effort update, silent on 404.
      customerAuthApi.updateAddress(id, toServerAddress(patch as Address)).catch(() => {});
    }
  }, []);

  const removeAddress = useCallback((id: string) => {
    setState((s) => {
      const addresses = s.addresses.filter((a) => a.id !== id);
      const selectedId =
        s.selectedId === id ? (addresses[0]?.id ?? null) : s.selectedId;
      return { addresses, selectedId };
    });
    if (getToken()) customerAuthApi.deleteAddress(id).catch(() => {});
  }, []);

  const selectAddress = useCallback((id: string) => {
    setState((s) => ({ ...s, selectedId: id }));
  }, []);

  const selected = useMemo(
    () => state.addresses.find((a) => a.id === state.selectedId) ?? null,
    [state.addresses, state.selectedId],
  );

  const value = useMemo<AddressContextValue>(
    () => ({
      addresses: state.addresses,
      selectedId: state.selectedId,
      selected,
      hydrated,
      modalOpen,
      modalNextRoute,
      openAddressModal,
      closeAddressModal,
      addAddress,
      updateAddress,
      removeAddress,
      selectAddress,
    }),
    [
      state.addresses,
      state.selectedId,
      selected,
      hydrated,
      modalOpen,
      modalNextRoute,
      openAddressModal,
      closeAddressModal,
      addAddress,
      updateAddress,
      removeAddress,
      selectAddress,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAddresses() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAddresses must be used inside <AddressProvider>');
  return ctx;
}

// ─── Server mapping ──────────────────────────────────────────────────
// Backend uses `pin` / `line1,line2` / `country` fields keyed by `id`;
// the storefront's Address type is a flatter record with `pincode`.

type ServerAddress = Customer['addressBook'][number];

function fromServerAddress(a: ServerAddress): Address {
  return {
    id: a.id,
    fullName: a.name,
    phone: a.phone,
    email: '',
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pin,
    country: a.country || 'India',
  };
}

function toServerAddress(a: Partial<Address>): Partial<ServerAddress> {
  return {
    id: a.id,
    label: 'Home',
    name: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pin: a.pincode,
    country: a.country || 'India',
  };
}
