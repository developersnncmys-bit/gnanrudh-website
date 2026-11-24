'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ordersApi, getToken, type CustomerOrder } from './api';
import { useAuth } from './auth';

export type OrderStatus = 'placed' | 'cancelled';
export type PayMethod = 'upi' | 'card' | 'netbanking' | 'cod';
export type ShipMethod = 'standard' | 'express';

export type OrderItem = {
  productId: string;
  // Optional variant id the piece-reservation needs. The cart doesn't
  // currently force a colour pick before Add-to-Cart, so the checkout
  // picks the first in-stock variant as a sensible default and sets it
  // here. Missing = backend rejects with 409.
  variantId?: string;
  name: string;
  weave: string;
  qty: number;
  unitPrice: number;
  image: string;
};

export type OrderAddress = {
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

export type Order = {
  id: string;
  createdAt: number;
  status: OrderStatus;
  cancelledAt?: number;
  cancelReason?: string;
  items: OrderItem[];
  itemCount: number;
  address: OrderAddress;
  payMethod: PayMethod;
  shipMethod: ShipMethod;
  paid: boolean;
  promoCode: string | null;
  subtotal: number;
  discount: number;
  shippingFee: number;
  codFee: number;
  tax: number;
  total: number;
};

export type PlaceOrderInput = Omit<Order, 'id' | 'createdAt' | 'status'>;

type OrdersState = {
  orders: Order[];
};

type OrdersContextValue = OrdersState & {
  hydrated: boolean;
  placeOrder: (input: PlaceOrderInput) => Order;
  cancelOrder: (id: string, reason?: string) => Order | null;
  getOrder: (id: string) => Order | undefined;
};

// AUTH-02: orders cache is scoped per signed-in identity so a browser
// shared across users never leaks orders from one account to another.
// Guests write to the shared 'guest' bucket; on sign-in the active bucket
// flips to the user's email so each account sees only its own cache.
const STORAGE_PREFIX = 'gnanrudh-orders-v1:';
const LEGACY_STORAGE_KEY = 'gnanrudh-orders-v1';
const storageKeyFor = (owner: string | null | undefined) =>
  `${STORAGE_PREFIX}${(owner || 'guest').toLowerCase()}`;
const Ctx = createContext<OrdersContextValue | null>(null);

function readStorage(owner: string | null | undefined): OrdersState {
  if (typeof window === 'undefined') return { orders: [] };
  try {
    const raw = window.localStorage.getItem(storageKeyFor(owner));
    if (!raw) return { orders: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { orders: [] };
    return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
  } catch {
    return { orders: [] };
  }
}

// AUTH-02: wipe the pre-scoping global bucket on first load so a stale
// cache written by an older build can't leak into whoever signs in now.
function purgeLegacyStorage() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
}

// Order IDs use a short prefix + last 8 digits of epoch + 2-char random
// suffix. Human-readable and collision-resistant enough for a demo.
function genOrderId(): string {
  const t = Date.now().toString().slice(-8);
  const r = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `TV${t}${r}`;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user, hydrated: authHydrated } = useAuth();
  // The bucket we read/write is tied to the signed-in email. Email is
  // lower-cased in storageKeyFor so case variance in the backend doesn't
  // spawn ghost buckets. Guests share the 'guest' bucket until they sign in.
  const owner = user?.email || null;
  const [state, setState] = useState<OrdersState>({ orders: [] });
  const [hydrated, setHydrated] = useState(false);

  // Drop the pre-scoping global bucket once per boot so its contents can't
  // leak into whichever user signs in next.
  useEffect(() => { purgeLegacyStorage(); }, []);

  // Rebind to the active user's bucket whenever auth settles or the signed-in
  // identity changes. Resets local state first (so other-user orders can
  // never render for a split second), then reads that user's own cache, then
  // overlays the server list for signed-in users.
  useEffect(() => {
    if (!authHydrated) return;
    setState(readStorage(owner));
    setHydrated(true);
    if (owner && getToken()) {
      ordersApi.list()
        .then((res) => {
          const serverOrders = (res.items || []).map(mapServerOrder);
          setState((prev) => ({ orders: mergeServerOrders(prev.orders, serverOrders) }));
        })
        .catch(() => { /* leave local orders untouched if the API is down */ });
    }
  }, [authHydrated, owner]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKeyFor(owner), JSON.stringify(state));
    } catch {
      /* localStorage full / disabled — silent */
    }
  }, [state, hydrated, owner]);

  // Cross-tab sync — if another tab places/cancels in the SAME bucket,
  // mirror it here. Other users' buckets are ignored so a second window
  // signed in as a different account can't push data across.
  useEffect(() => {
    const myKey = storageKeyFor(owner);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== myKey) return;
      setState(readStorage(owner));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [owner]);

  const placeOrder = useCallback((input: PlaceOrderInput): Order => {
    const order: Order = {
      ...input,
      id: genOrderId(),
      createdAt: Date.now(),
      status: 'placed',
    };
    setState((s) => ({ orders: [order, ...s.orders] }));
    // Fire-and-forget: persist to backend for signed-in customers so the
    // admin CRM sees the order and the next /me rehydrate reconciles the
    // server id. Failures are logged — the local order still stands so
    // the UX never blocks on network.
    if (getToken()) {
      ordersApi.create({
        items: input.items.map((it) => ({ pid: it.productId, vid: it.variantId, qty: it.qty })),
        shipping: input.shippingFee,
        coupon: input.promoCode,
        paymentMethod: input.payMethod,
        address: {
          pin: input.address.pincode,
          label: 'Checkout',
          name: input.address.fullName,
          phone: input.address.phone,
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          state: input.address.state,
          country: input.address.country,
        },
      }).catch((err) => {
        console.warn('[orders] server create failed:', err?.message || err);
      });
    }
    return order;
  }, []);

  const cancelOrder = useCallback((id: string, reason?: string): Order | null => {
    let updated: Order | null = null;
    setState((s) => ({
      orders: s.orders.map((o) => {
        if (o.id !== id || o.status === 'cancelled') return o;
        updated = {
          ...o,
          status: 'cancelled',
          cancelledAt: Date.now(),
          cancelReason: reason ?? 'user',
        };
        return updated;
      }),
    }));
    if (updated && getToken()) {
      ordersApi.cancel(id).catch((err) => {
        console.warn('[orders] server cancel failed:', err?.message || err);
      });
    }
    return updated;
  }, []);

  const getOrder = useCallback(
    (id: string) => state.orders.find((o) => o.id === id),
    [state.orders],
  );

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders: state.orders,
      hydrated,
      placeOrder,
      cancelOrder,
      getOrder,
    }),
    [state.orders, hydrated, placeOrder, cancelOrder, getOrder],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrders() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrders must be used inside <OrdersProvider>');
  return ctx;
}

// Map a server-persisted order into the storefront's display shape. Server
// orders carry less local metadata (full product name, shipping method tier,
// per-line image) so we fill the gaps from the items array; the account
// page still renders the line, just with the server's canonical id.
function mapServerOrder(o: CustomerOrder): Order {
  const items: OrderItem[] = (o.items || []).map((it) => ({
    productId: it.pid,
    name: it.pid,
    weave: '',
    qty: it.qty,
    unitPrice: it.price,
    image: '',
  }));
  const paid = String(o.payment?.status || '').toLowerCase() === 'paid';
  const cancelled = String(o.status || '').toLowerCase().includes('cancel');
  return {
    id: o._id,
    createdAt: Date.parse(o.placed) || Date.now(),
    status: cancelled ? 'cancelled' : 'placed',
    items,
    itemCount: items.reduce((s, it) => s + it.qty, 0),
    address: {
      fullName: '',
      phone: '',
      email: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: o.ship?.pin || '',
      country: 'India',
    },
    payMethod: (o.payment?.method as PayMethod) || 'upi',
    shipMethod: 'standard',
    paid,
    promoCode: o.coupon,
    subtotal: o.sub || 0,
    discount: o.discount || 0,
    shippingFee: o.shipping || 0,
    codFee: 0,
    tax: 0,
    total: o.total || 0,
  };
}

// Merge server + local order lists by id, preferring the server copy when
// both exist. Local-only orders (guest-flow or server-write-still-in-flight)
// stay visible so a just-placed order doesn't disappear on hydration.
function mergeServerOrders(local: Order[], server: Order[]): Order[] {
  const byId = new Map<string, Order>();
  for (const o of local) byId.set(o.id, o);
  for (const o of server) byId.set(o.id, o);
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}
