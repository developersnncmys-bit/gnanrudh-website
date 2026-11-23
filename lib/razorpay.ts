// Loads the Razorpay Checkout Standard script on demand and exposes a
// typed `openRazorpay` helper that opens the hosted modal. Kept out of
// components so any payment surface (checkout, retry-payment page, etc.)
// can call the same flow.
//
// The checkout script is lazy — we don't want to pull 60KB on every page
// load just because the user might visit /shop. First call injects a
// <script> tag and resolves when the SDK registers window.Razorpay;
// subsequent calls return immediately.

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loadPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay can only be loaded in the browser'));
  if ((window as any).Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      // Someone (likely React Strict Mode double-invoke in dev) injected the
      // script but window.Razorpay hasn't appeared yet. Wait for its load.
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout script')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loadPromise = null; // allow retry on next click
      reject(new Error('Failed to load Razorpay Checkout script'));
    };
    document.head.appendChild(s);
  });

  return loadPromise;
}

export type RazorpayHandlerPayload = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayOpenOptions = {
  keyId: string;
  rzpOrderId: string;
  amount: number; // paise
  currency: string;
  name?: string;         // brand name shown in the modal header
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  onSuccess: (payload: RazorpayHandlerPayload) => void;
  onDismiss?: () => void;
  onFailure?: (err: unknown) => void;
};

// Opens the Razorpay Checkout modal. `onSuccess` fires once Razorpay says
// the payment went through (the three-field payload must still be verified
// on your server — never trust it client-side). `onDismiss` fires when the
// user closes the modal without paying. `onFailure` fires on
// payment.failed events (card decline, OTP timeout, etc.).
export async function openRazorpay(opts: RazorpayOpenOptions): Promise<void> {
  await loadRazorpayScript();
  const Razorpay = (window as any).Razorpay;
  if (!Razorpay) throw new Error('Razorpay SDK did not initialise');

  const rzp = new Razorpay({
    key: opts.keyId,
    order_id: opts.rzpOrderId,
    amount: opts.amount,
    currency: opts.currency,
    name: opts.name || 'House of GnanRudh',
    description: opts.description || 'Order payment',
    prefill: opts.prefill || {},
    theme: { color: opts.theme?.color || '#012d20' },
    handler: (payload: RazorpayHandlerPayload) => {
      opts.onSuccess(payload);
    },
    modal: {
      ondismiss: () => {
        opts.onDismiss?.();
      },
    },
  });
  rzp.on?.('payment.failed', (resp: unknown) => {
    opts.onFailure?.(resp);
  });
  rzp.open();
}
