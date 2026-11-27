'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { couponsApi, ordersApi, paymentApi, type ServerPublicCoupon } from '@/lib/api';
import { openRazorpay } from '@/lib/razorpay';
import { useRouter } from 'next/navigation';

type ShipMethod = 'standard' | 'express';
type PayMethod = 'upi' | 'card' | 'netbanking' | 'cod';

const EXPRESS_FEE = 500;
const COD_FEE = 100;
const GST_RATE = 0.05;

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
  const { placeOrder, cancelOrder } = useOrders();

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  const [shipMethod, setShipMethod] = useState<ShipMethod>('standard');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplying, setPromoApplying] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<ServerPublicCoupon[]>([]);
  const [placing, setPlacing] = useState(false);
  // Synchronous lock to stop a second Pay click (or Enter + click double-fire)
  // from creating a duplicate order while React is still batching the
  // `placing` state update. React state is a tick behind — the ref isn't.
  // Both are reset together in every exit path below.
  const placingRef = useRef(false);
  // B2B GST invoice (GST-05). Shoppers who want input tax credit tick the
  // box and fill in their GSTIN + business name + billing address. The
  // fields only submit when the box is ticked so a legitimate B2C buyer
  // who typed something and then unchecked doesn't accidentally end up
  // with a B2B invoice.
  const [wantGstInvoice, setWantGstInvoice] = useState(false);
  const [billingGstin, setBillingGstin] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [gstError, setGstError] = useState('');

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
      setPromoCode(null);
      setPromoDiscount(0);
      setPlacing(false); placingRef.current = false;
      setWantGstInvoice(false);
      setBillingGstin('');
      setBillingName('');
      setBillingAddress('');
      setGstError('');
    }
  }, [open]);

  // Load the admin-maintained coupon strip on open. Guarded by `open` so
  // the fetch doesn't fire on every mount of the popup wrapper, and the
  // response is only committed when still open to avoid setting state on
  // an unmounted dialog.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    couponsApi.list()
      .then((r) => { if (!cancelled) setAvailableCoupons(r.items || []); })
      .catch((err) => { console.warn('[checkout] couponsApi.list failed', err); });
    return () => { cancelled = true; };
  }, [open]);

  // Re-validate the applied coupon whenever cart lines change — a user who
  // removed an eligible item or dropped below the min-order should see the
  // discount go to zero with an explanation, not keep a stale number.
  const cartSignature = items
    .map((i) => `${i.saree.id}:${i.qty}:${i.saree.price}`)
    .join('|');
  useEffect(() => {
    if (!promoCode || !items.length) return;
    let cancelled = false;
    const payload = {
      items: items.map((i) => ({ pid: i.saree.id, qty: i.qty, price: i.saree.price })),
    };
    couponsApi.validate(promoCode, payload)
      .then((r) => {
        if (cancelled) return;
        if (r.ok && typeof r.discount === 'number') {
          setPromoDiscount(r.discount);
          setPromoError('');
        } else {
          setPromoCode(null);
          setPromoDiscount(0);
          setPromoError(r.reason || 'Coupon no longer applies to this cart');
        }
      })
      .catch(() => { /* keep last-known good — order creation will revalidate */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, promoCode]);

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
  // CPN-03: discount is whatever the server's /coupons/:code/validate
  // returned for the current cart. Never computed from a client-side
  // promo map — those drift from what the admin publishes. Clamped so a
  // stale response can't drop the paying total below zero.
  const discount = promoCode ? Math.min(cartSubtotal, Math.max(0, promoDiscount)) : 0;
  const taxable = Math.max(cartSubtotal - discount, 0) + shippingFee + codFee;
  // Per-line GST using each product's admin-set rate (Product drawer →
  // GST panel → HSN + override). Items without an explicit rate fall
  // back to the storefront default (GST_RATE). Any coupon discount is
  // apportioned across lines pro-rata by line value so the net amount
  // being taxed still equals (subtotal − discount). Shipping + COD fees
  // are taxed at the default rate. Mirrors the CartDrawer math so the
  // cart "Estimated total" and the checkout "To pay" agree to the rupee.
  const discountRatio = cartSubtotal > 0 ? discount / cartSubtotal : 0;
  const itemsGst = items.reduce((sum, { saree, qty }) => {
    const rate =
      typeof saree.gst === 'number' && Number.isFinite(saree.gst)
        ? saree.gst / 100
        : GST_RATE;
    const netLineTotal = saree.price * qty * (1 - discountRatio);
    return sum + netLineTotal * rate;
  }, 0);
  const feesGst = (shippingFee + codFee) * GST_RATE;
  const tax = Math.round(itemsGst + feesGst);
  const total = Math.max(cartSubtotal - discount, 0) + shippingFee + codFee + tax;
  const mrpTotal = cartSubtotal;
  // Label collapses to "GST (N%)" when every item in the basket uses the
  // same rate; otherwise it's plain "GST" with the itemised breakdown
  // living on the tax invoice.
  const gstRateSet = new Set(
    items.map(({ saree }) =>
      typeof saree.gst === 'number' && Number.isFinite(saree.gst)
        ? saree.gst
        : GST_RATE * 100,
    ),
  );
  const gstLabel = gstRateSet.size === 1 ? `GST (${[...gstRateSet][0]}%)` : 'GST';

  const applyCoupon = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code || promoApplying) return;
    if (!items.length) {
      setPromoError('Add a saree before applying a coupon');
      return;
    }
    setPromoApplying(true);
    setPromoError('');
    try {
      const r = await couponsApi.validate(code, {
        items: items.map((i) => ({ pid: i.saree.id, qty: i.qty, price: i.saree.price })),
      });
      if (r.ok && typeof r.discount === 'number') {
        setPromoCode(code);
        setPromoDiscount(r.discount);
        setPromoError('');
        setPromoInput('');
      } else {
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoError(r.reason || 'That code is not valid');
      }
    } catch (err) {
      setPromoError((err as Error).message || 'Could not apply coupon');
    } finally {
      setPromoApplying(false);
    }
  };

  const removeCoupon = () => {
    setPromoCode(null);
    setPromoDiscount(0);
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

  // Release server-side piece reservation when the payment doesn't go
  // through. Previously the paymentApi.cancel call was fire-and-forget
  // with a swallowed catch — if it failed (network blip, 500), the pieces
  // stayed Reserved and the next customer couldn't buy that variant until
  // a cron cleaned up stale orders. Now we surface the failure as a toast
  // + console entry so the user knows to reach out, and the admin sees
  // the orphan in the orders list.
  const releaseServerReservation = async (orderId: string, reason: string) => {
    try {
      await paymentApi.cancel(orderId);
    } catch (err) {
      const msg = (err as Error).message || 'unknown error';
      console.error(`[checkout] paymentApi.cancel failed for ${orderId} (${reason}):`, msg);
      alert(
        `We couldn't release your order's reservation automatically (ref ${orderId}). Our team will tidy it up — you were NOT charged. Please contact support if you need this cleared immediately.`,
      );
    }
  };

  const onPlaceOrder = async (e: FormEvent) => {
    e.preventDefault();
    // Synchronous short-circuit — `placing` state lags by a render, so
    // two clicks in the same React tick would both see it false and
    // double-create the order. See the duplicate GR-MWYLNLX69ZIJ /
    // GR-MWYLNLDTPQ3I pair that prompted this guard.
    if (placingRef.current) return;
    placingRef.current = true;
    if (placing) { placingRef.current = false; return; }
    // Defence-in-depth: if the user reached the popup without being
    // signed in (e.g. signed out in another tab after the popup opened),
    // close the checkout and re-open it after a successful login.
    if (!authHydrated) { placingRef.current = false; return; }
    if (!user) {
      placingRef.current = false;
      closeCheckout();
      openLogin(() => openCheckout());
      return;
    }
    if (!selectedAddress) {
      placingRef.current = false;
      openAddressModal();
      return;
    }
    // GST-05: when the shopper ticks "I need a GST invoice", validate the
    // GSTIN format before sending it to the server (the Order schema
    // accepts whatever we send, so the UI is the first line of defence).
    // Expected shape: 2-digit state code + 10-char PAN + 1-char entity +
    // "Z" default + 1-char checksum. Mixed case input is uppercased so a
    // stray lowercase letter still passes.
    const gstinClean = billingGstin.trim().toUpperCase();
    if (wantGstInvoice) {
      if (!gstinClean) {
        placingRef.current = false;
        setGstError('GSTIN is required when "I need a GST invoice" is ticked.');
        return;
      }
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/.test(gstinClean)) {
        placingRef.current = false;
        setGstError('GSTIN must be 15 characters in the standard format (e.g. 29ABCDE1234F1Z5).');
        return;
      }
      if (!billingName.trim()) {
        placingRef.current = false;
        setGstError('Business name is required for a GST invoice.');
        return;
      }
    }
    setGstError('');
    setPlacing(true);

    // Captured once up-front so our local-state mirror stays consistent
    // with what the server stored even if items change between create and
    // post-payment routing.
    const orderItems: OrderItemRecord[] = items.map(({ saree, variant, qty }) => {
      // Use the colour the shopper actually picked on the PDP (resolved
      // onto the cart line). For legacy vid-less lines — a shopper who
      // tapped Add to Cart before picking a swatch — fall back to the
      // first in-stock variant so the backend piece reservation still
      // lands on something fulfillable. Falls back further to the first
      // variant if none report stock (the admin numbers are denormalised
      // — the piece-level check is authoritative).
      let pickedVariantId = variant?.id;
      if (!pickedVariantId) {
        const variants = saree.variants || [];
        const picked = variants.find((v) => (v.stock ?? 0) > 0) ?? variants[0];
        pickedVariantId = picked?.id;
      }
      return {
        productId: saree.id,
        variantId: pickedVariantId,
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
        // Only send GST fields when the shopper opted in. A blank GSTIN
        // keeps the invoice B2C — the admin render flips to "Registered"
        // only when billingGstin is non-empty.
        billingGstin: wantGstInvoice ? gstinClean : '',
        billingName: wantGstInvoice ? billingName.trim() : '',
        billingAddress: wantGstInvoice ? billingAddress.trim() : '',
      });
    } catch (err) {
      setPlacing(false); placingRef.current = false;
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
      setPlacing(false); placingRef.current = false;
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
      setPlacing(false); placingRef.current = false;
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
            setPlacing(false); placingRef.current = false;
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
            setPlacing(false); placingRef.current = false;
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
          // Cancelled on the server, AND mirror the cancel into the local
          // orders store so the Account page's "Placed" badge immediately
          // flips to "Cancelled" without waiting for a page reload.
          setPlacing(false); placingRef.current = false;
          cancelOrder(serverOrder._id, 'payment-dismissed');
          await releaseServerReservation(serverOrder._id, 'dismissed');
        },
        onFailure: async () => {
          setPlacing(false); placingRef.current = false;
          cancelOrder(serverOrder._id, 'payment-failed');
          await releaseServerReservation(serverOrder._id, 'failed');
          alert('Payment failed. Please try again or pick a different payment method.');
        },
      });
    } catch (err) {
      setPlacing(false); placingRef.current = false;
      cancelOrder(serverOrder._id, 'razorpay-open-failed');
      await releaseServerReservation(serverOrder._id, 'open-failed');
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
                  {items.map(({ saree, variant, qty }) => (
                    <li key={`${saree.id}::${variant?.id ?? ''}`} className="flex gap-3 py-3 first:pt-0">
                      <div className="relative w-12 h-16 shrink-0 overflow-hidden bg-bone">
                        {(() => {
                          const src = getProductHero(saree);
                          return src ? (
                            <Image
                              src={src}
                              alt={saree.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : null;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-ink/55">{saree.weave}</div>
                        <div className="text-xs font-semibold text-ink leading-tight line-clamp-2">
                          {saree.name}
                        </div>
                        <div className="text-[11px] text-ink/55 mt-0.5">
                          {variant && (
                            <>
                              <span className="inline-block align-middle w-2 h-2 rounded-full ring-1 ring-black/15 mr-1" style={{ background: variant.hex }} aria-hidden />
                              {variant.colour} · </>
                          )}Qty {qty}
                        </div>
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
                <SummaryRow label={gstLabel} value={formatINR(tax)} muted />
                <div className="h-px bg-ink/10 my-2" />
                <SummaryRow label="To pay" value={formatINR(total)} strong />
              </div>
            )}

            {/* GST invoice (B2B) — pinned to the top of the checkout so
                business shoppers see the opt-in before they commit to an
                address / payment choice. Fields only submit when the box
                is ticked; a legitimate B2C buyer who typed something and
                then unchecked doesn't end up with a B2B invoice. */}
            <SectionEyebrow>GST invoice</SectionEyebrow>
            <div className="px-5 pb-4">
              <div className="border border-ink/15 bg-white p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantGstInvoice}
                    onChange={(e) => {
                      setWantGstInvoice(e.target.checked);
                      if (!e.target.checked) setGstError('');
                    }}
                    className="mt-1 accent-maroon-deep"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">I need a GST invoice</span>
                    <span className="block text-[11px] text-ink/60 mt-0.5">
                      For businesses that want to claim input tax credit. We print your GSTIN on the tax invoice.
                    </span>
                  </span>
                </label>

                {wantGstInvoice && (
                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 tracking-wider uppercase mb-1" htmlFor="co-gstin">GSTIN</label>
                      <input
                        id="co-gstin"
                        type="text"
                        value={billingGstin}
                        onChange={(e) => setBillingGstin(e.target.value.toUpperCase())}
                        placeholder="29ABCDE1234F1Z5"
                        maxLength={15}
                        className="w-full border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-ink tracking-wider font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 tracking-wider uppercase mb-1" htmlFor="co-bizname">Business name</label>
                      <input
                        id="co-bizname"
                        type="text"
                        value={billingName}
                        onChange={(e) => setBillingName(e.target.value)}
                        placeholder="Registered business name"
                        className="w-full border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 tracking-wider uppercase mb-1" htmlFor="co-bizaddr">Billing address (optional)</label>
                      <textarea
                        id="co-bizaddr"
                        value={billingAddress}
                        onChange={(e) => setBillingAddress(e.target.value)}
                        placeholder="Registered business address — leave blank to use the shipping address"
                        rows={2}
                        className="w-full border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-ink resize-none"
                      />
                    </div>
                    {gstError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">
                        {gstError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

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

            {/* COUPONS — active codes from the admin. The input lets a
                shopper type a hidden code (influencer / loyalty) that may
                not be in the public list. Clicking a card auto-fills +
                applies. All validation is server-side. */}
            <SectionEyebrow>Coupons &amp; offers</SectionEyebrow>
            <div className="px-5 pb-4">
              {promoCode ? (
                <div className="border border-emerald-700/40 bg-emerald-50/50 p-3 flex items-start gap-3 mb-3">
                  <span className="shrink-0 mt-0.5 text-emerald-700">
                    <TagIcon />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-ink">
                      {promoCode} applied
                    </div>
                    <div className="text-[11px] text-ink/70 mt-0.5 tabular-nums">
                      You save {formatINR(discount)} on this order
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-ink/60 hover:text-maroon-deep underline-offset-2 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-stretch gap-2 mb-2">
                  <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={promoInput}
                    onChange={(e) => {
                      setPromoInput(e.target.value.toUpperCase());
                      if (promoError) setPromoError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCoupon(promoInput);
                      }
                    }}
                    placeholder="Enter coupon code"
                    className="flex-1 min-w-0 border border-ink/20 bg-white px-3 py-2.5 text-xs font-semibold text-ink placeholder:text-ink/40 focus:outline-none focus:border-ink tracking-wider"
                    aria-label="Coupon code"
                  />
                  <button
                    type="button"
                    onClick={() => applyCoupon(promoInput)}
                    disabled={promoApplying || !promoInput.trim()}
                    className="shrink-0 bg-ink text-white px-4 text-[11px] font-bold tracking-wider uppercase hover:bg-maroon-deep transition-colors disabled:bg-ink/30 disabled:cursor-not-allowed"
                  >
                    {promoApplying ? '…' : 'Apply'}
                  </button>
                </div>
              )}
              {promoError && !promoCode && (
                <p className="text-[11px] text-maroon mb-2">{promoError}</p>
              )}
              {availableCoupons.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink/55 mb-2">
                    Available offers
                  </div>
                  <ul className="space-y-2">
                    {availableCoupons.map((c) => {
                      const active = promoCode === c.code;
                      const belowMin = c.min > 0 && cartSubtotal < c.min;
                      const label = c.kind === 'Percent'
                        ? `${c.value}% off${c.scope && c.scope !== 'All products' ? ` on ${c.scope}` : ''}`
                        : `Flat ${formatINR(c.value)} off${c.scope && c.scope !== 'All products' ? ` on ${c.scope}` : ''}`;
                      return (
                        <li
                          key={c.code}
                          className={`border p-3 flex items-start gap-3 bg-white ${
                            active ? 'border-emerald-700/50' : 'border-ink/15'
                          }`}
                        >
                          <span className="shrink-0 mt-0.5 text-maroon-deep">
                            <TagIcon />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-bold text-ink tracking-wider">{c.code}</span>
                              <span className="text-[11px] text-ink/70">{label}</span>
                            </div>
                            <div className="text-[10px] text-ink/55 mt-0.5">
                              {c.min > 0 && <>Min order {formatINR(c.min)}. </>}
                              {c.ends && <>Ends {new Date(c.ends).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.</>}
                            </div>
                          </div>
                          {active ? (
                            <span className="shrink-0 text-[11px] font-bold tracking-wider uppercase text-emerald-700">
                              Applied
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => applyCoupon(c.code)}
                              disabled={promoApplying || belowMin}
                              className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-maroon-deep hover:text-ink disabled:text-ink/30 disabled:cursor-not-allowed"
                            >
                              {belowMin ? `Add ${formatINR(c.min - cartSubtotal)}` : 'Apply'}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
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

