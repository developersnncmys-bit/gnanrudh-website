'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  LuSmartphone,
  LuCreditCard,
  LuLandmark,
  LuBanknote,
} from 'react-icons/lu';
import { formatINR } from '@/lib/sarees';
import { getProductHero } from '@/lib/product-images';
import { useShop } from '@/lib/shop-store';
import { useAddresses } from '@/lib/addresses';
import { useCheckoutModal } from '@/lib/checkout-modal';
import { useCartDrawer } from '@/lib/cart-drawer';
import { useLoginModal } from '@/lib/login-modal';
import { useAuth } from '@/lib/auth';
import { useScrollLock } from '@/lib/scroll-lock';
import { useOrders, type OrderItem as OrderItemRecord } from '@/lib/orders';
import { ordersApi, paymentApi } from '@/lib/api';
import { openRazorpay } from '@/lib/razorpay';
import { useRouter } from 'next/navigation';

type ShipMethod = 'standard' | 'express';
type PayMethod = 'upi' | 'card' | 'netbanking' | 'cod';

const STANDARD_THRESHOLD = 25_000;
const EXPRESS_FEE = 500;
const COD_FEE = 100;
const GST_RATE = 0.05;
const PROMO_CODES: Record<string, number> = {
  WELCOME10: 0.1,
  HEIRLOOM15: 0.15,
};

// Drawer width on desktop so we can offset the popup to sit beside it
// rather than on top of it.
const DRAWER_WIDTH_PX = 440;

export default function CheckoutPopup() {
  const router = useRouter();
  const { open, openCheckout, closeCheckout } = useCheckoutModal();
  const { open: cartOpen, closeCart } = useCartDrawer();
  const { openLogin } = useLoginModal();
  const { user, hydrated: authHydrated } = useAuth();
  const { cartItems: items, hydrated, cartSubtotal, clearCart } = useShop();
  const {
    addresses,
    selectedId,
    selected: selectedAddress,
    selectAddress,
    openAddressModal,
  } = useAddresses();
  const { placeOrder } = useOrders();

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  const [shipMethod, setShipMethod] = useState<ShipMethod>('standard');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');
  const [placing, setPlacing] = useState(false);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setSummaryOpen(false);
      setPromoInput('');
      setPromoError('');
      setPlacing(false);
    }
  }, [open]);

  // Auto-select a saved address when the checkout opens. Covers two
  // cases: (a) the local address book was already populated but had no
  // selectedId cached, and (b) the server sync loaded the book after the
  // checkout was already open. Prefers a selectedId that still resolves;
  // otherwise falls back to the first saved address. Keeps the UI out of
  // the "no address picked" state whenever the user has anything saved.
  useEffect(() => {
    if (!open || !addresses.length) return;
    const stillValid = selectedId && addresses.some((a) => a.id === selectedId);
    if (stillValid) return;
    selectAddress(addresses[0].id);
  }, [open, selectedId, addresses, selectAddress]);

  if (!open) return null;

  // ── Totals ────────────────────────────────────────────────────────────
  const shippingFee = shipMethod === 'express' ? EXPRESS_FEE : 0;
  const codFee = payMethod === 'cod' ? COD_FEE : 0;
  const discount = promoCode ? Math.round(cartSubtotal * (PROMO_CODES[promoCode] ?? 0)) : 0;
  const taxable = Math.max(cartSubtotal - discount, 0) + shippingFee + codFee;
  const tax = Math.round(taxable * GST_RATE);
  const total = taxable + tax;
  const mrpTotal = cartSubtotal;

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (!(code in PROMO_CODES)) {
      setPromoError('That code is not valid');
      setPromoCode(null);
      return;
    }
    setPromoCode(code);
    setPromoError('');
  };

  const handleClose = () => {
    closeCheckout();
  };

  // Close both the popup AND the cart drawer cleanly before navigating
  // away — otherwise the drawer slides over the destination page.
  const closeAllAndGo = (path: string) => {
    closeCheckout();
    closeCart();
    router.push(path);
  };

  const onPlaceOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (placing) return;
    // Defence-in-depth: if the user reached the popup without being
    // signed in (e.g. signed out in another tab after the popup opened),
    // close the checkout and re-open it after a successful login.
    if (!authHydrated) return;
    if (!user) {
      closeCheckout();
      openLogin(() => openCheckout());
      return;
    }
    if (!selectedAddress) {
      openAddressModal();
      return;
    }
    setPlacing(true);

    // Captured once up-front so our local-state mirror stays consistent
    // with what the server stored even if items change between create and
    // post-payment routing.
    const orderItems: OrderItemRecord[] = items.map(({ saree, qty }) => {
      // Pick the first variant that still has stock so piece reservation
      // on the backend lands on something fulfillable. Falls back to the
      // first variant if none report stock (the admin numbers are
      // denormalised — the piece-level check is authoritative). The cart
      // doesn't force a colour pick before Add to Cart yet, so this is
      // the "default colour" behaviour.
      const variants = saree.variants || [];
      const pickedVariant =
        variants.find((v) => (v.stock ?? 0) > 0) ?? variants[0];
      return {
        productId: saree.id,
        variantId: pickedVariant?.id,
        name: saree.name,
        weave: saree.weave,
        qty,
        unitPrice: saree.price,
        image: getProductHero(saree),
      };
    });
    const addressSnapshot = {
      fullName: selectedAddress.fullName,
      phone: selectedAddress.phone,
      email: selectedAddress.email,
      line1: selectedAddress.line1,
      line2: selectedAddress.line2,
      city: selectedAddress.city,
      state: selectedAddress.state,
      pincode: selectedAddress.pincode,
      country: selectedAddress.country,
    };

    // 1) Create the order on the server. This also reserves pieces so no
    //    one else can buy the same variants while the user is on the
    //    Razorpay modal. A 409 means a variant went out of stock between
    //    adding to cart and clicking Pay — surface that cleanly.
    let serverOrder: { _id: string; total: number };
    try {
      serverOrder = await ordersApi.create({
        // `vid` is required by the backend's piece-reservation step —
        // without it `reservePiecesForOrder` can't find a matching Piece
        // and bails with 409 "Not enough stock". See the variant pick
        // above in `orderItems`.
        items: orderItems.map((it) => ({ pid: it.productId, vid: it.variantId, qty: it.qty })),
        shipping: shippingFee + codFee,
        discount,
        coupon: promoCode,
        paymentMethod: payMethod,
        address: {
          pin: addressSnapshot.pincode,
          label: 'Checkout',
          name: addressSnapshot.fullName,
          phone: addressSnapshot.phone,
          line1: addressSnapshot.line1,
          line2: addressSnapshot.line2,
          city: addressSnapshot.city,
          state: addressSnapshot.state,
          country: addressSnapshot.country,
        },
      });
    } catch (err) {
      setPlacing(false);
      alert(`Could not create order: ${(err as Error).message || 'please try again'}`);
      return;
    }

    // Mirror into local orders state so the Orders page and Thank-You
    // interstitial can render instantly without a round-trip. The server
    // is already the source of truth for status changes after this point.
    const local = placeOrder({
      items: orderItems,
      itemCount,
      address: addressSnapshot,
      payMethod,
      shipMethod,
      paid: false, // flipped true after verify for prepaid; stays false for COD
      promoCode,
      subtotal: cartSubtotal,
      discount,
      shippingFee,
      codFee,
      tax,
      total,
    });
    // Align the local record to the server's authoritative id so retries
    // / cancellations through the Orders page talk to the right doc.
    local.id = serverOrder._id;

    // 2) COD skips Razorpay entirely — the money comes in on delivery, so
    //    there's nothing for the gateway to confirm. The order stays
    //    'Payment pending' server-side; the admin flips it on fulfilment.
    if (payMethod === 'cod') {
      clearCart();
      setPlacing(false);
      const qs = new URLSearchParams({
        id: serverOrder._id,
        email: addressSnapshot.email,
        phone: addressSnapshot.phone,
        ship: shipMethod,
      });
      closeAllAndGo(`/order/thank-you?${qs.toString()}`);
      return;
    }

    // 3) Ask the backend to create a Razorpay order (uses the secret key
    //    server-side) and return the ids the Checkout Standard modal needs.
    let rzpInit: Awaited<ReturnType<typeof paymentApi.createOrder>>;
    try {
      rzpInit = await paymentApi.createOrder(serverOrder._id);
    } catch (err) {
      setPlacing(false);
      alert(`Could not start payment: ${(err as Error).message || 'please try again'}`);
      return;
    }

    // 4) Open the Razorpay modal. The callbacks fire asynchronously, so
    //    `placing` stays true until success / failure / dismiss resolves.
    try {
      await openRazorpay({
        keyId: rzpInit.keyId,
        rzpOrderId: rzpInit.rzpOrderId,
        amount: rzpInit.amount,
        currency: rzpInit.currency,
        description: `Order ${serverOrder._id}`,
        prefill: {
          name: rzpInit.customer.name || addressSnapshot.fullName,
          email: rzpInit.customer.email || addressSnapshot.email,
          contact: rzpInit.customer.phone || addressSnapshot.phone,
        },
        onSuccess: async (payload) => {
          try {
            // 5) Server-side HMAC verify + mark order Paid. Only after this
            //    returns do we trust the payment and route to success.
            await paymentApi.verify({
              orderId: serverOrder._id,
              razorpay_order_id: payload.razorpay_order_id,
              razorpay_payment_id: payload.razorpay_payment_id,
              razorpay_signature: payload.razorpay_signature,
            });
            clearCart();
            setPlacing(false);
            const qs = new URLSearchParams({
              order: serverOrder._id,
              method: payMethod,
              amount: String(serverOrder.total),
              ref: payload.razorpay_payment_id,
            });
            closeAllAndGo(`/payment/success?${qs.toString()}`);
          } catch (err) {
            // Payment went through but our verify endpoint didn't complete
            // (network blip, 500, whatever). The money is with Razorpay; the
            // retry page refetches the order and — because the webhook will
            // mark it Paid independently — the user usually sees a Paid
            // state and gets forwarded to /payment/success automatically.
            // The ref is in the URL so support can quote it if needed.
            setPlacing(false);
            console.warn('[checkout] verify failed, routing to /payment/retry', err);
            const qs = new URLSearchParams({
              order: serverOrder._id,
              ref: payload.razorpay_payment_id,
            });
            closeAllAndGo(`/payment/retry?${qs.toString()}`);
          }
        },
        onDismiss: async () => {
          // User closed the modal without paying. Release the reserved
          // pieces so stock becomes available to others, mark the order
          // Cancelled, and let the user keep shopping.
          setPlacing(false);
          try { await paymentApi.cancel(serverOrder._id); } catch { /* swallow */ }
        },
        onFailure: async () => {
          setPlacing(false);
          try { await paymentApi.cancel(serverOrder._id); } catch { /* swallow */ }
          alert('Payment failed. Please try again or pick a different payment method.');
        },
      });
    } catch (err) {
      setPlacing(false);
      try { await paymentApi.cancel(serverOrder._id); } catch { /* swallow */ }
      alert(`Payment could not open: ${(err as Error).message}`);
    }
  };

  // Simulates the user clicking back on the payment gateway — closes the
  // popup and lands on /payment/cancelled. With a real gateway this is
  // the redirect URL the gateway calls when the user aborts payment.
  const onCancelPayment = () => {
    closeAllAndGo('/payment/cancelled?reason=cancelled');
  };

  if (hydrated && items.length === 0) {
    return (
      <Overlay onClose={handleClose} cartOpen={cartOpen}>
        <Shell>
          <Header onClose={handleClose} brand="HOUSE OF GNANRUDH" />
          <div className="p-8 text-center">
            <div className="text-sm font-bold text-ink">Your bag is empty.</div>
            <p className="mt-1.5 text-xs text-ink/65">Add a saree to begin checkout.</p>
            <Link
              href="/shop"
              onClick={handleClose}
              className="mt-5 inline-block bg-maroon-deep text-ivory px-6 py-2.5 text-xs font-semibold tracking-wide hover:bg-maroon transition-colors"
            >
              Continue shopping
            </Link>
          </div>
        </Shell>
      </Overlay>
    );
  }

  const savings = discount + (mrpTotal - cartSubtotal); // discount only for now

  return (
    <Overlay onClose={handleClose} cartOpen={cartOpen}>
      <Shell>
        <Header
          onClose={handleClose}
                    savings={savings > 0 ? savings : 0}
          itemCount={itemCount}
          total={total}
          mrp={discount > 0 ? cartSubtotal : null}
          chevronOpen={summaryOpen}
          onChevronClick={() => setSummaryOpen((v) => !v)}
        />

        <form onSubmit={onPlaceOrder} className="flex flex-col min-h-0" id="checkout-popup-form">
          <div
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: 'calc(92vh - 240px)' }}
          >
            {/* Order summary — expanded view shows items + breakdown */}
            {summaryOpen && (
              <div className="px-5 py-4 border-b border-ink/10 bg-bone/15">
                <ul className="divide-y divide-ink/10 mb-3">
                  {items.map(({ saree, qty }) => (
                    <li key={saree.id} className="flex gap-3 py-3 first:pt-0">
                      <div className="relative w-12 h-16 shrink-0 overflow-hidden bg-bone">
                        <Image
                          src={getProductHero(saree)}
                          alt={saree.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-ink/55">{saree.weave}</div>
                        <div className="text-xs font-semibold text-ink leading-tight line-clamp-2">
                          {saree.name}
                        </div>
                        <div className="text-[11px] text-ink/55 mt-0.5">Qty {qty}</div>
                      </div>
                      <div className="text-xs font-semibold text-ink tabular-nums shrink-0">
                        {formatINR(saree.price * qty)}
                      </div>
                    </li>
                  ))}
                </ul>

                <SummaryRow label="Subtotal" value={formatINR(cartSubtotal)} />
                {discount > 0 && (
                  <SummaryRow label={`Discount (${promoCode})`} value={`− ${formatINR(discount)}`} accent />
                )}
                <SummaryRow
                  label="Shipping"
                  value={shippingFee === 0 ? 'Free' : formatINR(shippingFee)}
                />
                {codFee > 0 && <SummaryRow label="COD handling" value={formatINR(codFee)} />}
                <SummaryRow label="GST (5%)" value={formatINR(tax)} muted />
                <div className="h-px bg-ink/10 my-2" />
                <SummaryRow label="To pay" value={formatINR(total)} strong />
              </div>
            )}

            {/* DELIVERY DETAILS card */}
            <SectionEyebrow>Delivery details</SectionEyebrow>
            <div className="px-5 pb-4">
              {selectedAddress ? (
                <div className="border border-ink/15 bg-white">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5 text-ink/55">
                        <PinIcon />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-ink">
                          Deliver to {selectedAddress.fullName}
                        </div>
                        <div className="text-xs text-ink/75 mt-1 leading-relaxed">
                          {selectedAddress.line1}
                          {selectedAddress.line2 && <>, {selectedAddress.line2}</>}
                          <br />
                          {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pincode}
                        </div>
                        <div className="text-[11px] text-ink/55 mt-1.5 tabular-nums">
                          {selectedAddress.phone} <span className="mx-1">·</span> {selectedAddress.email}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddressModal()}
                        className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-ink border border-ink/25 px-3 py-1.5 hover:bg-maroon-deep hover:text-ivory transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  {/* Inline shipping line, like Kalki */}
                  <div className="border-t border-ink/10 px-4 py-2.5 flex items-center justify-between bg-bone/20">
                    <div className="flex items-center gap-2">
                      <span className="text-ink/55"><TruckIcon /></span>
                      <span className="text-xs font-semibold text-ink">Shipping</span>
                    </div>
                    {shipMethod === 'express' ? (
                      <span className="text-xs font-bold text-ink tabular-nums">
                        {formatINR(EXPRESS_FEE)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold tracking-wider uppercase bg-peacock text-ivory px-2 py-0.5">
                        Free
                      </span>
                    )}
                  </div>
                  {/* Inline express upsell */}
                  <div className="border-t border-ink/10 px-4 py-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shipMethod === 'express'}
                        onChange={(e) => setShipMethod(e.target.checked ? 'express' : 'standard')}
                        className="accent-ink"
                      />
                      <span className="text-xs text-ink/75">
                        Upgrade to <span className="font-semibold text-ink">Express delivery</span> (2–3 days)
                      </span>
                    </label>
                    <span className="text-[11px] font-semibold text-ink/65 tabular-nums">
                      +{formatINR(EXPRESS_FEE)}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAddressModal()}
                  className="w-full border border-ink/20 bg-white px-5 py-6 text-[0.95rem] font-semibold text-ink hover:border-ink hover:bg-ink/[0.02] transition-colors flex items-center justify-center gap-3"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Select delivery address
                </button>
              )}
            </div>

            {/* PAYMENT OPTIONS */}
            <SectionEyebrow>Payment options</SectionEyebrow>
            <div className="px-5 pb-4">
              <PaymentRow
                checked={payMethod === 'upi'}
                onClick={() => setPayMethod('upi')}
                icon="upi"
                title="UPI"
                sub="GPay, PhonePe, Paytm, BHIM"
                amount={formatINR(total)}
              />
              <PaymentRow
                checked={payMethod === 'card'}
                onClick={() => setPayMethod('card')}
                icon="card"
                title="Credit / Debit card"
                sub="Visa, Mastercard, RuPay, Amex"
                amount={formatINR(total)}
              />
              <PaymentRow
                checked={payMethod === 'netbanking'}
                onClick={() => setPayMethod('netbanking')}
                icon="bank"
                title="Net banking"
                sub="All major Indian banks"
                amount={formatINR(total)}
              />
              <PaymentRow
                checked={payMethod === 'cod'}
                onClick={() => setPayMethod('cod')}
                icon="cod"
                title="Cash on delivery"
                sub={`+ ${formatINR(COD_FEE)} handling fee`}
                amount={formatINR(total)}
              />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="border-t border-ink/10 px-5 py-4 bg-bone shrink-0">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-ink/55">TO PAY</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-ink tabular-nums leading-tight">
                    {formatINR(total)}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-ink/55 max-w-[180px] text-right leading-snug">
                256-bit SSL · Insured dispatch · 48 Hrs returns
              </div>
            </div>

            <button
              type="submit"
              disabled={placing || !hydrated}
              className="w-full bg-ink text-white py-4 text-sm font-bold tracking-[0.18em] uppercase hover:bg-maroon-deep transition-colors disabled:bg-ink/40 disabled:cursor-not-allowed"
            >
              {placing
                ? 'Placing order…'
                : !selectedAddress
                ? 'Select address to continue'
                : payMethod === 'cod'
                ? 'Place order'
                : 'Pay & place order'}
            </button>
            {/* Mimics the gateway 'cancel payment' return URL — useful for
                testing the /payment/cancelled page without a real gateway. */}
            {payMethod !== 'cod' && (
              <button
                type="button"
                onClick={onCancelPayment}
                disabled={placing}
                className="mt-2 w-full text-center text-[11px] text-ink/55 hover:text-maroon underline underline-offset-2 disabled:opacity-50"
              >
                Cancel payment
              </button>
            )}
          </div>
        </form>
      </Shell>
    </Overlay>
  );
}

// ── Overlay + Shell ──────────────────────────────────────────────────────

function Overlay({
  onClose,
  cartOpen,
  children,
}: {
  onClose: () => void;
  cartOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6 ${
        // Push the centered popup left so the cart drawer sits beside it
        // — but ONLY at md+ where the drawer is its real 440px width and
        // there's room for both. On mobile the drawer slides off-screen
        // (see CartDrawer.tsx) and the popup gets the full viewport.
        cartOpen ? 'md:pr-[calc(440px+1rem)]' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
      data-lenis-prevent
    >
      <button
        type="button"
        aria-label="Close checkout"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Shell sizes naturally to its content, capped at 92vh. The scroll body
  // inside owns its own explicit `maxHeight` so the scroll cap doesn't
  // depend on a flex-1 chain resolving correctly (which was unreliable
  // when stacked beside the cart drawer overlay).
  return (
    <div className="relative w-full max-w-[580px] max-h-[92vh] flex flex-col bg-bone shadow-2xl overflow-hidden">
      {children}
    </div>
  );
}

function Header({
  onClose,
  savings = 0,
  itemCount = 0,
  total,
  mrp,
  chevronOpen,
  onChevronClick,
}: {
  onClose: () => void;
  brand?: string; // accepted for back-compat with old callsites, no longer rendered
  savings?: number;
  itemCount?: number;
  total?: number;
  mrp?: number | null;
  chevronOpen?: boolean;
  onChevronClick?: () => void;
}) {
  return (
    <div className="px-5 py-4 border-b border-ink/10 shrink-0 bg-bone">
      <div className="flex items-center gap-3">
        <img
          src="/G-R-logo.png"
          alt="House Of GnanRudh"
          className="h-12 w-auto shrink-0 select-none"
          draggable={false}
        />
        <h2 id="checkout-title" className="sr-only">Checkout</h2>

        {/* Centre — item count + chevron that toggles the breakdown. */}
        {typeof total === 'number' && onChevronClick ? (
          <button
            type="button"
            onClick={onChevronClick}
            aria-label={chevronOpen ? 'Collapse order summary' : 'Expand order summary'}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-ink hover:text-maroon-deep transition-colors"
          >
            <span className="text-sm font-semibold tabular-nums">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${chevronOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="flex-1" />
        )}

        {typeof total === 'number' && (
          <div className="flex flex-col items-end leading-tight shrink-0">
            {mrp != null && (
              <span className="text-xs text-ink/45 line-through tabular-nums">{formatINR(mrp)}</span>
            )}
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatINR(total)}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 w-8 h-8 flex items-center justify-center text-ink hover:text-maroon-deep transition-colors -mr-1"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {savings > 0 && (
        <div className="mt-2 text-[11px] font-semibold text-emerald-700 tabular-nums text-right">
          {formatINR(savings)} saved
        </div>
      )}
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-ink/55">
      {children}
    </div>
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  muted = false,
  strong = false,
  accent = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className={`text-xs ${muted ? 'text-ink/55' : 'text-ink/80'}`}>{label}</span>
      <span
        className={`text-xs tabular-nums ${
          strong
            ? 'text-sm font-bold text-ink'
            : accent
            ? 'font-semibold text-peacock'
            : muted
            ? 'text-ink/55'
            : 'font-semibold text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentRow({
  checked,
  onClick,
  icon,
  title,
  sub,
  amount,
}: {
  checked: boolean;
  onClick: () => void;
  icon: 'upi' | 'card' | 'bank' | 'cod';
  title: string;
  sub: string;
  amount: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 border p-4 transition-colors mb-2 last:mb-0 text-left bg-white ${
        checked ? 'border-ink' : 'border-ink/15 hover:border-ink/40'
      }`}
    >
      <span
        className={`shrink-0 w-10 h-10 flex items-center justify-center border rounded-sm ${
          checked ? 'border-ink bg-ink/5' : 'border-ink/15 bg-bone/50'
        }`}
      >
        <PayIcon name={icon} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-ink leading-tight">{title}</span>
        <span className="block text-[11px] text-ink/60 mt-0.5">{sub}</span>
      </span>
      <span className="text-sm font-semibold text-ink tabular-nums shrink-0">{amount}</span>
      <span
        className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          checked ? 'border-ink' : 'border-ink/25'
        }`}
      >
        {checked && <span className="w-2 h-2 rounded-full bg-maroon-deep" />}
      </span>
    </button>
  );
}

function PayIcon({ name }: { name: 'upi' | 'card' | 'bank' | 'cod' }) {
  const common = { size: 18, strokeWidth: 1.7, 'aria-hidden': true } as const;
  switch (name) {
    case 'upi':
      return <LuSmartphone {...common} />;
    case 'card':
      return <LuCreditCard {...common} />;
    case 'bank':
      return <LuLandmark {...common} />;
    case 'cod':
      return <LuBanknote {...common} />;
  }
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12 13 5H4v9l7 7Z" />
      <circle cx="8" cy="9" r="1" />
    </svg>
  );
}

