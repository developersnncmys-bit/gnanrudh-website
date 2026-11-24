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
import { isSoldOut, totalStock, type Saree } from './sarees';

// A cart line is uniquely keyed by (productId, variantId ?? null).
// variantId is null for Add-to-Cart clicks made before the user picked a
// colour (or on surfaces like AddToCartButton / StickyBuyBar that can't
// surface a picker). A (pid, null) and a (pid, "<vid>") are DIFFERENT
// offers to the shopper and render as two cart rows — same model as
// every mainstream ecommerce cart.
export type CartItem = { productId: string; variantId?: string | null; quantity: number };
export type ResolvedVariant = {
  id: string;
  colour: string;
  hex: string;
  sku?: string;
  stock?: number;
};
// `variant` is populated when the line carries a variantId AND that id
// still resolves in the live catalogue (variants can be removed by the
// admin). `cap` is the live stock ceiling for the line — per-variant
// stock when `variant` is set, otherwise falls back to the product-wide
// total. `null` means "unknown" and the backend's piece reservation is
// the final guard.
export type ResolvedCartItem = {
  saree: Saree;
  variant: ResolvedVariant | null;
  qty: number;
  cap: number | null;
};
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

  // Cart. Every mutator accepts an optional variantId so callers that
  // know the picked colour (PDP, cart drawer stepper) target the right
  // line; surfaces that don't (StickyBuyBar, AddToCartButton) omit it
  // and the store treats the add as a (productId, null) line.
  addToCart: (productId: string, qty?: number, variantId?: string | null) => void;
  removeFromCart: (productId: string, variantId?: string | null) => void;
  updateCartQty: (productId: string, qty: number, variantId?: string | null) => void;
  // `inCart(pid)` with no vid returns true if any line for that product
  // exists (used for the PDP "Added · View Bag" chip). Passing a vid
  // narrows to that specific variant line.
  inCart: (productId: string, variantId?: string | null) => boolean;
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
    (productId: string, qty = 1, variantId: string | null = null) => {
      // Defence-in-depth: callers (PDP, cart drawer, Buy It Now) already
      // gate on OOS, but a stale snapshot of `saree.variants[*].stock`
      // could still slip through between render and click. Refuse the
      // add and surface a toast rather than let the cart hold an
      // unshippable line that order creation would 409 on later.
      const saree = sareeById.get(productId);
      if (saree && isSoldOut(saree)) {
        pushToast({
          kind: 'cart-add',
          productId,
          message: `${saree.name} is sold out`,
        });
        return;
      }
      // Cap cumulative qty at the variant's live stock when a variant
      // was picked; otherwise fall back to the product's total across
      // every variant. The variant path replaces the old "sum across
      // colours" cap that let a cart line of 11 land against a colour
      // that only had 7 pieces in stock. A null cap (unknown stock)
      // leaves the backend's piece reservation as the final guard.
      const variant = saree && variantId
        ? saree.variants?.find((v) => v.id === variantId)
        : null;
      const cap = variant
        ? (typeof variant.stock === 'number' ? variant.stock : null)
        : (saree ? totalStock(saree) : null);
      // Secondary OOS check: picked variant has zero pieces. Still toast
      // so the caller surfaces something — the CTA gating is per-component.
      if (variant && typeof variant.stock === 'number' && variant.stock <= 0) {
        pushToast({
          kind: 'cart-add',
          productId,
          message: `${saree?.name ?? 'Saree'} (${variant.colour}) is out of stock`,
        });
        return;
      }
      const vidKey = variantId || null;
      setState((s) => {
        const existing = s.cart.find(
          (i) => i.productId === productId && (i.variantId ?? null) === vidKey,
        );
        const currentQty = existing?.quantity ?? 0;
        const requested = currentQty + qty;
        const next = cap != null ? Math.min(requested, cap) : requested;
        if (next === currentQty) {
          if (cap != null && saree) {
            pushToast({
              kind: 'cart-add',
              productId,
              message: variant
                ? `Only ${cap} of ${saree.name} (${variant.colour}) available`
                : `Only ${cap} of ${saree.name} available`,
            });
          }
          return s;
        }
        const cart = existing
          ? s.cart.map((i) =>
              i === existing ? { ...i, quantity: next } : i,
            )
          : [...s.cart, { productId, variantId: vidKey, quantity: next }];
        pushCartToServer(cart);
        return { ...s, cart };
      });
      pushToast({
        kind: 'cart-add',
        productId,
        message: variant
          ? `${productName(productId)} (${variant.colour}) added to bag`
          : `${productName(productId)} added to bag`,
      });
    },
    [pushToast, pushCartToServer, sareeById],
  );

  const removeFromCart = useCallback(
    (productId: string, variantId: string | null = null) => {
      const vidKey = variantId || null;
      setState((s) => {
        const cart = s.cart.filter(
          (i) => !(i.productId === productId && (i.variantId ?? null) === vidKey),
        );
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

  const updateCartQty = useCallback(
    (productId: string, qty: number, variantId: string | null = null) => {
      // Per-variant cap when a variant is given; otherwise fall back to
      // the product-wide total so legacy (pid, null) lines still clamp.
      const saree = sareeById.get(productId);
      const variant = saree && variantId
        ? saree.variants?.find((v) => v.id === variantId)
        : null;
      const cap = variant
        ? (typeof variant.stock === 'number' ? variant.stock : null)
        : (saree ? totalStock(saree) : null);
      const nextQty = cap != null
        ? Math.min(Math.max(0, qty), cap)
        : Math.max(0, qty);
      const vidKey = variantId || null;
      setState((s) => {
        const existing = s.cart.find(
          (i) => i.productId === productId && (i.variantId ?? null) === vidKey,
        );
        if (!existing && nextQty <= 0) return s;
        if (existing && existing.quantity === nextQty) return s;
        const cart = nextQty <= 0
          ? s.cart.filter(
              (i) => !(i.productId === productId && (i.variantId ?? null) === vidKey),
            )
          : existing
            ? s.cart.map((i) =>
                i === existing ? { ...i, quantity: nextQty } : i,
              )
            : [...s.cart, { productId, variantId: vidKey, quantity: nextQty }];
        pushCartToServer(cart);
        return { ...s, cart };
      });
      if (cap != null && qty > cap && saree) {
        pushToast({
          kind: 'cart-add',
          productId,
          message: variant
            ? `Only ${cap} of ${saree.name} (${variant.colour}) available`
            : `Only ${cap} of ${saree.name} available`,
        });
      }
    },
    [pushCartToServer, pushToast, sareeById],
  );

  // No vid → any line for this product counts (keeps the PDP "Added"
  // chip honest when the shopper has a different colour of the same
  // saree in the bag). vid → narrow to that specific line.
  const inCart = useCallback(
    (productId: string, variantId: string | null = null) => {
      if (variantId == null) return state.cart.some((i) => i.productId === productId);
      return state.cart.some(
        (i) => i.productId === productId && (i.variantId ?? null) === variantId,
      );
    },
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
        // Cart = union by (productId, variantId ?? null), max(server_qty,
        // local_qty) so conflicts land on the higher count rather than
        // silently halving the quantity. THEN cap each line to that
        // variant's live in-stock count (or the product-wide total for
        // vid-less legacy lines) — without this, a local qty of 15
        // against a 3-stock variant would survive the merge and then
        // explode at checkout with a 409 "not enough stock". Products
        // not in the catalogue map get passed through (pruned separately
        // by the orphan-cart effect).
        const mergeKey = (i: CartItem) => `${i.productId}::${i.variantId ?? ''}`;
        const qtyByKey = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
        const bumpQty = (i: CartItem) => {
          const key = mergeKey(i);
          const prev = qtyByKey.get(key);
          const vid = i.variantId ?? null;
          qtyByKey.set(key, {
            productId: i.productId,
            variantId: vid,
            quantity: Math.max(prev?.quantity ?? 0, i.quantity),
          });
        };
        for (const i of serverCart) bumpQty(i);
        for (const i of s.cart) bumpQty(i);
        const mergedCart: CartItem[] = [];
        for (const entry of qtyByKey.values()) {
          const saree = sareeById.get(entry.productId);
          if (!saree) { mergedCart.push(entry); continue; }
          const v = entry.variantId
            ? saree.variants?.find((x) => x.id === entry.variantId)
            : null;
          const cap = v
            ? (typeof v.stock === 'number' ? v.stock : null)
            : (saree.variants?.length
              ? saree.variants.reduce((sum, x) => sum + (x.stock ?? 0), 0)
              : null);
          // Zero live cap → the line is dead; drop it so the cart
          // drawer doesn't render an empty row and the next order
          // creation doesn't 409 on an unshippable qty.
          if (cap != null && cap <= 0) continue;
          mergedCart.push(cap != null
            ? { ...entry, quantity: Math.min(entry.quantity, cap) }
            : entry);
        }
        // Only push back if the merge differs from what the server sent.
        if (mergedWishlist.length !== serverIds.length) {
          customerAuthApi.setWishlist(mergedWishlist).catch(() => {});
        }
        // Diff is now keyed on (productId, variantId ?? null) — a line
        // that changed colour without changing qty still counts as a
        // delta that needs pushing back to the server.
        const cartChanged = mergedCart.length !== serverCart.length ||
          mergedCart.some((i) => {
            const match = serverCart.find(
              (x) => x.productId === i.productId && (x.variantId ?? null) === (i.variantId ?? null),
            );
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
  // hidden products silently drop out, as do lines whose variantId no
  // longer exists on the product (admin removed that colour). Empty
  // until liveSarees arrives. `cap` is the live stock ceiling for the
  // line — per-variant when the line has a vid, product-wide otherwise.
  const cartItems = useMemo<ResolvedCartItem[]>(() => {
    const out: ResolvedCartItem[] = [];
    for (const item of state.cart) {
      const saree = sareeById.get(item.productId);
      if (!saree) continue;
      const variant = item.variantId
        ? saree.variants?.find((v) => v.id === item.variantId) ?? null
        : null;
      // Line had a vid but the variant is gone from the catalogue — drop
      // it rather than render a broken "unknown colour" row.
      if (item.variantId && !variant) continue;
      const cap = variant
        ? (typeof variant.stock === 'number' ? variant.stock : null)
        : totalStock(saree);
      out.push({
        saree,
        variant: variant
          ? {
              id: variant.id,
              colour: variant.colour,
              hex: variant.hex,
              sku: variant.sku,
              stock: variant.stock,
            }
          : null,
        qty: item.quantity,
        cap,
      });
    }
    return out;
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

  // Prune cart entries whose product OR picked variant is no longer in
  // the catalogue so the stale ids stop living in localStorage forever.
  // Guarded on a non-empty catalogue so a failed /products fetch doesn't
  // wipe the real cart.
  useEffect(() => {
    if (!hydrated || cartLoading || sareeById.size === 0) return;
    setState((s) => {
      const filtered = s.cart.filter((item) => {
        const saree = sareeById.get(item.productId);
        if (!saree) return false;
        if (!item.variantId) return true;
        return Boolean(saree.variants?.some((v) => v.id === item.variantId));
      });
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
