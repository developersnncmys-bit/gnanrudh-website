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
import { useLiveSarees } from './catalog';
import { useAuth } from './auth';
import { customerAuthApi } from './api';
import type { Saree } from './sarees';

export type CartItem = { productId: string; quantity: number };
export type ResolvedCartItem = { saree: Saree; qty: number };
type ToastKind = 'cart-add' | 'cart-remove' | 'wishlist-add' | 'wishlist-remove';

export type Toast = {
  id: number;
  kind: ToastKind;
  productId: string;
  message: string;
};

type ShopState = {
  cart: CartItem[];
  wishlist: string[];
};

type ShopContextValue = ShopState & {
  hydrated: boolean;
  cartCount: number;
  cartSubtotal: number;
  wishlistCount: number;

  // Live-resolved cart lines (localStorage ids joined with the live
  // catalogue). Items whose product is no longer in the catalogue are
  // silently dropped. Empty until the live fetch resolves — consumers
  // key their loading UI off `cartLoading`.
  cartItems: ResolvedCartItem[];
  cartLoading: boolean;
  findSaree: (productId: string) => Saree | undefined;

  // Cart
  addToCart: (productId: string, qty?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  inCart: (productId: string) => boolean;
  clearCart: () => void;

  // Wishlist
  toggleWishlist: (productId: string) => void;
  inWishlist: (productId: string) => boolean;
  clearWishlist: () => void;

  // Toasts
  toasts: Toast[];
  dismissToast: (id: number) => void;
};

const STORAGE_KEY = 'gnanrudh-shop-v1';
const ShopContext = createContext<ShopContextValue | null>(null);

function readStorage(): ShopState {
  if (typeof window === 'undefined') return { cart: [], wishlist: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cart: [], wishlist: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { cart: [], wishlist: [] };
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
    };
  } catch {
    return { cart: [], wishlist: [] };
  }
}

let toastId = 0;

export function ShopProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShopState>({ cart: [], wishlist: [] });
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Wishlist is server-backed for signed-in customers (synced to the
  // Customer.wishlist field in Mongo) and localStorage-only otherwise.
  // `userRef` lets toggleWishlist/clearWishlist read the current auth
  // state without recreating the callback on every /me refresh.
  const { user, hydrated: authHydrated } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Single live-catalogue fetch for the whole app. Resolving cart/wishlist
  // ids here keeps CartDrawer/BagPanel/Toaster off the static SAREES seed.
  const { sarees: liveSarees, loading: cartLoading } = useLiveSarees();
  const sareeById = useMemo(() => {
    const m = new Map<string, Saree>();
    for (const s of liveSarees) m.set(s.id, s);
    return m;
  }, [liveSarees]);
  const findSaree = useCallback((id: string) => sareeById.get(id), [sareeById]);

  // Hydrate from storage on mount
  useEffect(() => {
    setState(readStorage());
    setHydrated(true);
  }, []);

  // Persist on every change after hydration
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage full / disabled — fail silently
    }
  }, [state, hydrated]);

  // Cross-tab sync: if another tab changes the cart/wishlist, mirror it here
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    toastId += 1;
    const id = toastId;
    setToasts((t) => [...t, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const productName = (id: string) =>
    sareeById.get(id)?.name ?? 'Saree';

  // ── Cart ─────────────────────────────────────────────────────────────
  // Cart is account-tied for signed-in customers (mirrored to
  // Customer.cart in Mongo via /api/customer-auth/cart) and localStorage
  // only otherwise. Every local mutation also fires a fire-and-forget PUT
  // when signed in, same pattern as the wishlist.
  const pushCartToServer = useCallback((items: CartItem[]) => {
    if (!userRef.current) return;
    customerAuthApi.setCart(items).catch(() => { /* retry on next change */ });
  }, []);

  const addToCart = useCallback(
    (productId: string, qty = 1) => {
      setState((s) => {
        const existing = s.cart.find((i) => i.productId === productId);
        const cart = existing
          ? s.cart.map((i) =>
              i.productId === productId ? { ...i, quantity: i.quantity + qty } : i,
            )
          : [...s.cart, { productId, quantity: qty }];
        pushCartToServer(cart);
        return { ...s, cart };
      });
      pushToast({
        kind: 'cart-add',
        productId,
        message: `${productName(productId)} added to bag`,
      });
    },
    [pushToast, pushCartToServer],
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setState((s) => {
        const cart = s.cart.filter((i) => i.productId !== productId);
        pushCartToServer(cart);
        return { ...s, cart };
      });
      pushToast({
        kind: 'cart-remove',
        productId,
        message: `${productName(productId)} removed from bag`,
      });
    },
    [pushToast, pushCartToServer],
  );

  const updateCartQty = useCallback((productId: string, qty: number) => {
    setState((s) => {
      const cart = qty <= 0
        ? s.cart.filter((i) => i.productId !== productId)
        : s.cart.map((i) =>
            i.productId === productId ? { ...i, quantity: qty } : i,
          );
      pushCartToServer(cart);
      return { ...s, cart };
    });
  }, [pushCartToServer]);

  const inCart = useCallback(
    (productId: string) => state.cart.some((i) => i.productId === productId),
    [state.cart],
  );

  const clearCart = useCallback(() => setState((s) => {
    pushCartToServer([]);
    return { ...s, cart: [] };
  }), [pushCartToServer]);

  // ── Wishlist ─────────────────────────────────────────────────────────
  // When the customer is signed in, every change is also pushed to
  // /api/customer-auth/wishlist so it survives sign-outs and roams across
  // devices. Fire-and-forget with a swallowed catch — the UI already
  // updated optimistically; a failed sync just means the server lags for
  // one request.
  const pushWishlistToServer = useCallback((ids: string[]) => {
    if (!userRef.current) return;
    customerAuthApi.setWishlist(ids).catch(() => { /* retry on next change */ });
  }, []);

  const toggleWishlist = useCallback(
    (productId: string) => {
      setState((s) => {
        const has = s.wishlist.includes(productId);
        const wishlist = has
          ? s.wishlist.filter((id) => id !== productId)
          : [...s.wishlist, productId];
        pushToast({
          kind: has ? 'wishlist-remove' : 'wishlist-add',
          productId,
          message: has
            ? `${productName(productId)} removed from wishlist`
            : `${productName(productId)} saved to wishlist`,
        });
        pushWishlistToServer(wishlist);
        return { ...s, wishlist };
      });
    },
    [pushToast, pushWishlistToServer],
  );

  const inWishlist = useCallback(
    (productId: string) => state.wishlist.includes(productId),
    [state.wishlist],
  );

  const clearWishlist = useCallback(
    () => setState((s) => {
      pushWishlistToServer([]);
      return { ...s, wishlist: [] };
    }),
    [pushWishlistToServer],
  );

  // On sign-in, fetch the server wishlist AND cart, union each with
  // whatever was saved locally (so items added while signed-out don't
  // vanish), and push the merged lists back so the server reflects the
  // union. Guarded by a per-session ref so the merge only runs once per
  // sign-in; on sign-out we reset the ref so the next sign-in re-merges.
  const didSyncAccountRef = useRef(false);
  const signedInEmail = user?.email || null;
  useEffect(() => {
    if (!hydrated || !authHydrated) return;
    if (!signedInEmail) {
      didSyncAccountRef.current = false;
      return;
    }
    if (didSyncAccountRef.current) return;
    didSyncAccountRef.current = true;
    Promise.all([
      customerAuthApi.getWishlist().catch(() => ({ items: [] as string[] })),
      customerAuthApi.getCart().catch(() => ({ items: [] as CartItem[] })),
    ]).then(([wl, ct]) => {
      const serverIds = wl.items;
      const serverCart = ct.items;
      setState((s) => {
        // Wishlist = union of sets.
        const mergedWishlist = Array.from(new Set([...serverIds, ...s.wishlist]));
        // Cart = union by productId, max(server_qty, local_qty) so
        // conflicts land on the higher count rather than silently
        // halving the quantity.
        const qtyById = new Map<string, number>();
        for (const i of serverCart) qtyById.set(i.productId, Math.max(qtyById.get(i.productId) || 0, i.quantity));
        for (const i of s.cart) qtyById.set(i.productId, Math.max(qtyById.get(i.productId) || 0, i.quantity));
        const mergedCart: CartItem[] = Array.from(qtyById, ([productId, quantity]) => ({ productId, quantity }));
        // Only push back if the merge differs from what the server sent.
        if (mergedWishlist.length !== serverIds.length) {
          customerAuthApi.setWishlist(mergedWishlist).catch(() => {});
        }
        const cartChanged = mergedCart.length !== serverCart.length ||
          mergedCart.some((i) => {
            const match = serverCart.find((x) => x.productId === i.productId);
            return !match || match.quantity !== i.quantity;
          });
        if (cartChanged) {
          customerAuthApi.setCart(mergedCart).catch(() => {});
        }
        return { ...s, wishlist: mergedWishlist, cart: mergedCart };
      });
    }).catch(() => { didSyncAccountRef.current = false; });
  }, [hydrated, authHydrated, signedInEmail]);

  // Sign-out clear: when the user transitions from signed-in to signed-out
  // (or the token is invalidated by the backend), wipe the local cart and
  // wishlist from this device. The server copy stays intact so the next
  // sign-in restores everything. Uses a prev-user ref so the initial
  // null → null (anonymous) and null → user (hydration) transitions
  // don't accidentally clear a legitimate anonymous cart.
  const prevSignedInRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authHydrated) return;
    const wasSignedIn = prevSignedInRef.current;
    prevSignedInRef.current = signedInEmail;
    if (wasSignedIn && !signedInEmail) {
      // Direct setState — NOT clearCart/clearWishlist, which would push
      // an empty list to the server and wipe the account's saved items.
      setState({ cart: [], wishlist: [] });
    }
  }, [authHydrated, signedInEmail]);

  // ── Derived totals ───────────────────────────────────────────────────
  // Resolved cart lines — joined against the live catalogue. Deleted or
  // hidden products silently drop out. Empty until liveSarees arrives.
  const cartItems = useMemo<ResolvedCartItem[]>(() => {
    return state.cart
      .map((item) => {
        const saree = sareeById.get(item.productId);
        return saree ? { saree, qty: item.quantity } : null;
      })
      .filter((x): x is ResolvedCartItem => x !== null);
  }, [state.cart, sareeById]);

  // Nav badge count. While the catalogue is still loading we fall back to
  // the raw stored count so a user with items doesn't briefly see 0; once
  // the catalogue resolves, we use the joined count so orphan ids (e.g.
  // deleted products) stop showing in the badge when the drawer already
  // treats them as gone. Keeps badge and drawer agreeing.
  const cartCount = useMemo(() => {
    if (cartLoading) return state.cart.reduce((sum, i) => sum + i.quantity, 0);
    return cartItems.reduce((sum, i) => sum + i.qty, 0);
  }, [cartLoading, state.cart, cartItems]);

  // Prune cart entries whose product is no longer in the catalogue so the
  // stale ids stop living in localStorage forever. Guarded on a non-empty
  // catalogue so a failed /products fetch doesn't wipe the real cart.
  useEffect(() => {
    if (!hydrated || cartLoading || sareeById.size === 0) return;
    setState((s) => {
      const filtered = s.cart.filter((item) => sareeById.has(item.productId));
      if (filtered.length === s.cart.length) return s;
      return { ...s, cart: filtered };
    });
  }, [hydrated, cartLoading, sareeById]);

  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.saree.price * i.qty, 0),
    [cartItems],
  );

  const wishlistCount = state.wishlist.length;

  const value = useMemo<ShopContextValue>(
    () => ({
      cart: state.cart,
      wishlist: state.wishlist,
      hydrated,
      cartCount,
      cartSubtotal,
      wishlistCount,
      cartItems,
      cartLoading,
      findSaree,
      addToCart,
      removeFromCart,
      updateCartQty,
      inCart,
      clearCart,
      toggleWishlist,
      inWishlist,
      clearWishlist,
      toasts,
      dismissToast,
    }),
    [
      state,
      hydrated,
      cartCount,
      cartSubtotal,
      wishlistCount,
      cartItems,
      cartLoading,
      findSaree,
      addToCart,
      removeFromCart,
      updateCartQty,
      inCart,
      clearCart,
      toggleWishlist,
      inWishlist,
      clearWishlist,
      toasts,
      dismissToast,
    ],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>');
  return ctx;
}
