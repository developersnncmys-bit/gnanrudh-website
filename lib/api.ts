// Thin fetch wrapper around the Express backend.
//
// - Reads `NEXT_PUBLIC_API_URL` at build time (e.g. http://localhost:4000).
// - Automatically attaches the customer bearer token when one is stored in
//   localStorage under `gnanrudh-customer-token`.
// - Honours `X-Refreshed-Token` responses by rotating the stored token.
// - Throws an `ApiError` with status + message when the server returns a
//   non-2xx body so UI code can distinguish 401 from 500.
//
// Deliberately plain fetch — no axios/swr/react-query dependency so the
// bundle stays as light as the original storefront.

export const API_URL =
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'gnanrudh-customer-token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type ApiOptions = RequestInit & { auth?: boolean };

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, body, ...rest } = opts;
  const h: Record<string, string> = { Accept: 'application/json' };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  if (auth) {
    const t = getToken();
    if (t) h.Authorization = `Bearer ${t}`;
  }
  Object.assign(h, headers || {});

  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { ...rest, headers: h, body });

  // Sliding-window refresh. Server rotates tokens transparently when they're
  // close to expiry; store the new one without logging the customer out.
  const refreshed = res.headers.get('X-Refreshed-Token');
  if (refreshed) setToken(refreshed);

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data as any).error) || res.statusText || 'Request failed';
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────
// Domain API shims. Each returns the raw server shape; callers map to the
// storefront's display types (see lib/sarees.ts transforms).
// ─────────────────────────────────────────────────────────────────────────

export type ServerListResponse<T> = { items: T[]; total: number; limit: number; skip: number };

export type ServerProduct = {
  _id: string;
  cat: string;
  weave?: string;
  name: string;
  price: number;
  compareAt?: number | null;
  variants?: Array<{ id: string; colour: string; hex?: string; size?: string | null; stock: number; sku?: string; imageUrls?: string[] }>;
  hex?: string;
  zariHex?: string;
  fabric?: string;
  zari?: string | null;
  border?: string | null;
  occasions?: string[];
  occasion?: string;
  length?: string | null;
  width?: string | null;
  blousePiece?: boolean;
  blouseLength?: string;
  styleNo?: string;
  colourLabel?: string;
  care?: string;
  colourNote?: string;
  modelHeight?: string | null;
  drapeStyle?: string | null;
  images?: number;
  imageUrls?: string[];
  // Colour the main image set belongs to. One variant id for the whole
  // gallery (every photo in the set is that colour), or '' for shared.
  imageVariant?: string;
  video?: boolean;
  videoUrl?: string;
  // PDP detail fields controlled by the admin.
  designNo?: string;
  packContains?: string;
  manufacturedBy?: string;
  // Admin-authored copy for the PDP tabs.
  speciality?: string;
  styleTip?: string;
  fitTip?: string;
  shippingNote?: string;
  // Admin-authored FAQ pairs, rendered on the PDP's FAQs tab.
  faqs?: Array<{ q?: string; a?: string }>;
  hsn?: string;
  gst?: number;
  status?: 'Active' | 'Draft' | 'Hidden';
  // Admin-picked storefront badges (e.g. 'bestseller', 'onsale', 'newin',
  // 'featured', 'ready', 'fast'). Order follows what the admin chose.
  badges?: string[];
  rating?: string | number;
  reviews?: number;
  verifiedReviews?: number;
  created?: string;
};

export type ServerCategory = {
  _id: string; name: string; weaves: string[]; price: number[];
  visible: boolean; saree: boolean; story?: string; image?: string;
};

export type ServerArticle = {
  _id: string; title: string; type?: string; slug?: string;
  status: 'Draft' | 'Scheduled' | 'Published'; date?: string;
  seoTitle?: string; seoDesc?: string; body?: string; cover?: string;
};

export type ServerReview = {
  _id: string; pid: string; cid: string; oid?: string;
  rating: number; text: string; at: string; verified: boolean;
  status: 'Pending' | 'Published' | 'Rejected'; reply?: string;
};

export type ServerOccasion = { _id: string; name: string; parent?: string | null; order?: number; image?: string };

// Homepage hero carousel slide — one row per slide. See backend models/HeroSlide.js.
export type ServerHeroSlide = {
  _id: string;
  image: string;
  mobileImage?: string;
  objectPosition?: string;
  textSide?: 'left' | 'right';
  badgeLabel?: string;
  badgeTone?: 'maroon' | 'gold';
  eyebrow?: string;
  headline: string;
  supporting?: string;
  ctaLabel?: string;
  ctaHref?: string;
  order?: number;
  visible?: boolean;
};
export type ServerPriceRange = {
  _id: string;
  label: string;
  title?: string;
  description?: string;
  min: number;
  max: number | null;
  order: number;
  visible: boolean;
  image?: string;
};

// Products
export const productsApi = {
  list: (params: { q?: string; cat?: string; weave?: string; occasion?: string; limit?: number; skip?: number; sort?: string; dir?: 'asc' | 'desc' } = {}) =>
    api<ServerListResponse<ServerProduct>>(`/api/public/products?${qs(params)}`, { auth: false }),
  get: (id: string) => api<ServerProduct>(`/api/public/products/${encodeURIComponent(id)}`, { auth: false }),
};

export const categoriesApi = {
  list: () => api<ServerListResponse<ServerCategory>>(`/api/public/categories`, { auth: false }),
};

export const occasionsApi = {
  list: () => api<ServerListResponse<ServerOccasion>>(`/api/public/occasions`, { auth: false }),
};

export const priceRangesApi = {
  list: () => api<ServerListResponse<ServerPriceRange>>(`/api/public/price-ranges`, { auth: false }),
};

export const heroSlidesApi = {
  list: () => api<ServerListResponse<ServerHeroSlide>>(`/api/public/hero-slides`, { auth: false }),
};

export type ServerHomeBanner = {
  _id?: string;
  slot: 'explore' | 'bridal';
  image?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export const homeBannersApi = {
  list: () => api<{ items: ServerHomeBanner[] }>(`/api/public/home-banners`, { auth: false }),
};

export const journalApi = {
  list: (params: { type?: string; limit?: number; skip?: number } = {}) =>
    api<ServerListResponse<ServerArticle>>(`/api/public/journal?${qs(params)}`, { auth: false }),
  bySlug: (slug: string) => api<ServerArticle>(`/api/public/journal/by-slug/${encodeURIComponent(slug)}`, { auth: false }),
  get: (id: string) => api<ServerArticle>(`/api/public/journal/${encodeURIComponent(id)}`, { auth: false }),
};

export const reviewsApi = {
  list: (params: { pid?: string; limit?: number; skip?: number } = {}) =>
    api<ServerListResponse<ServerReview>>(`/api/public/reviews?${qs(params)}`, { auth: false }),
};

export const pagesApi = {
  get: (name: string) => api<{ name: string; body: string; banner?: string; updated?: string }>(
    `/api/public/pages/${encodeURIComponent(name)}`, { auth: false }),
};

export const scenesApi = {
  list: () => api<ServerListResponse<{ order: number; name: string; line: string }>>(
    `/api/public/scenes`, { auth: false }),
};

export const featuredApi = {
  list: () => api<{ ids: string[] }>(`/api/public/featured`, { auth: false }),
};

export const settingsApi = {
  get: () => api<{ store: any; ship: any; policy: any }>(`/api/public/settings`, { auth: false }),
};

// Customer auth
export type Customer = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  city: string | null;
  state: string | null;
  addressBook: Array<{
    id: string; label: string; name: string; phone: string;
    line1: string; line2: string; city: string; state: string; pin: string;
    country: string; isDefault: boolean;
  }>;
  wishlist: string[];
};

export const customerAuthApi = {
  signup: (payload: { firstName: string; lastName?: string; email: string; phone: string; password: string; dob?: string }) =>
    api<{ token: string; customer: Customer }>(`/api/customer-auth/signup`, {
      method: 'POST', body: JSON.stringify(payload), auth: false,
    }),
  login: (email: string, password: string) =>
    api<{ token: string; customer: Customer }>(`/api/customer-auth/login`, {
      method: 'POST', body: JSON.stringify({ email, password }), auth: false,
    }),
  me: () => api<{ customer: Customer }>(`/api/customer-auth/me`),
  logout: () => api<{ ok: true }>(`/api/customer-auth/logout`, { method: 'POST' }),
  updateProfile: (patch: Partial<Customer>) =>
    api<{ customer: Customer }>(`/api/customer-auth/me`, { method: 'PATCH', body: JSON.stringify(patch) }),
  changePassword: (current: string, next: string) =>
    api<{ ok: true }>(`/api/customer-auth/password`, { method: 'POST', body: JSON.stringify({ current, next }) }),
  listAddresses: () => api<{ items: Customer['addressBook'] }>(`/api/customer-auth/addresses`),
  addAddress: (addr: Partial<Customer['addressBook'][number]>) =>
    api<{ address: Customer['addressBook'][number]; items: Customer['addressBook'] }>(
      `/api/customer-auth/addresses`, { method: 'POST', body: JSON.stringify(addr) }),
  updateAddress: (id: string, patch: Partial<Customer['addressBook'][number]>) =>
    api<{ address: Customer['addressBook'][number]; items: Customer['addressBook'] }>(
      `/api/customer-auth/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAddress: (id: string) =>
    api<{ ok: true; items: Customer['addressBook'] }>(
      `/api/customer-auth/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getWishlist: () => api<{ items: string[] }>(`/api/customer-auth/wishlist`),
  setWishlist: (ids: string[]) =>
    api<{ items: string[] }>(`/api/customer-auth/wishlist`, { method: 'PUT', body: JSON.stringify({ ids }) }),
  getCart: () =>
    api<{ items: Array<{ productId: string; quantity: number }> }>(`/api/customer-auth/cart`),
  setCart: (items: Array<{ productId: string; quantity: number }>) =>
    api<{ items: Array<{ productId: string; quantity: number }> }>(
      `/api/customer-auth/cart`, { method: 'PUT', body: JSON.stringify({ items }) }),
};

// Orders
export type CustomerOrder = {
  _id: string;
  placed: string;
  cid: string;
  items: Array<{ pid: string; vid?: string | null; qty: number; price: number }>;
  sub: number;
  coupon: string | null;
  discount: number;
  shipping: number;
  total: number;
  payment: { method: string; status: string; rzp?: string | null };
  status: string;
  invoice: string | null;
  ship?: { pin?: string; courier?: string | null; awb?: string | null; etd?: string };
  deliveredAt?: string | null;
};

export type RefundEligibility = {
  eligible: boolean;
  deliveredAt?: string | null;
  daysSinceDelivery?: number;
  windowDays?: number;
  reason?: string;
};

export type CustomerReturn = {
  _id: string;
  oid: string;
  pid?: string | null;
  cid: string;
  reason: string;
  requested: string;
  amount: number;
  status: string;
  deliveredAt?: string | null;
  windowDays?: number;
  photos?: string[];
};

export const ordersApi = {
  list: () => api<ServerListResponse<CustomerOrder>>(`/api/customer-auth/orders`),
  get: (id: string) => api<CustomerOrder>(`/api/customer-auth/orders/${encodeURIComponent(id)}`),
  create: (payload: {
    items: Array<{ pid: string; vid?: string | null; qty: number }>;
    shipping?: number;
    coupon?: string | null;
    discount?: number;
    paymentMethod?: string;
    address?: { pin: string; [k: string]: any };
  }) => api<CustomerOrder>(`/api/customer-auth/orders`, { method: 'POST', body: JSON.stringify(payload) }),
  cancel: (id: string) =>
    api<CustomerOrder>(`/api/customer-auth/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  // Returns / refund requests — admin takes over on the backend once we
  // create the request. `refundEligibility` is cheap enough to call before
  // showing the button so the UI never offers an action the server will
  // reject (out of window, order not delivered, etc.).
  refundEligibility: (id: string) =>
    api<RefundEligibility>(`/api/customer-auth/orders/${encodeURIComponent(id)}/refund-eligibility`),
  requestRefund: (id: string, payload: { reason: string; pid?: string; photos?: string[] }) =>
    api<CustomerReturn>(`/api/customer-auth/orders/${encodeURIComponent(id)}/refund-request`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listReturns: (id: string) =>
    api<{ items: CustomerReturn[]; total: number }>(
      `/api/customer-auth/orders/${encodeURIComponent(id)}/returns`,
    ),
};

// Razorpay payment flow. Checkout opens the modal between create() and
// verify(): create → modal → verify → success. See lib/razorpay.ts for the
// hosted-modal loader.
export type RazorpayOrderResponse = {
  rzpOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  customer: { name: string; email: string; phone: string };
};

export const paymentApi = {
  createOrder: (ourOrderId: string) =>
    api<RazorpayOrderResponse>(`/api/customer-auth/payment/order`, {
      method: 'POST',
      body: JSON.stringify({ orderId: ourOrderId }),
    }),
  verify: (payload: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    api<CustomerOrder>(`/api/customer-auth/payment/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancel: (ourOrderId: string) =>
    api<{ ok: true }>(`/api/customer-auth/payment/cancel`, {
      method: 'POST',
      body: JSON.stringify({ orderId: ourOrderId }),
    }),
};

// ─────────────────────────────────────────────────────────────────────────
function qs(params: Record<string, any>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}
