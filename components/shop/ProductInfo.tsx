'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { type SAREES, formatINR, getColorways, isSoldOut } from '@/lib/sarees';
import { getPdpVariants, getProductHero } from '@/lib/product-images';
import { useLiveSarees } from '@/lib/catalog';
import { useShop } from '@/lib/shop-store';
import { useCartDrawer } from '@/lib/cart-drawer';
import { useCheckoutModal } from '@/lib/checkout-modal';
import { useLoginModal } from '@/lib/login-modal';
import { useAuth } from '@/lib/auth';
import { navHref } from '@/lib/soft-launch';

type Saree = (typeof SAREES)[number];

export default function ProductInfo({
  saree,
  mrp,
  badge,
  viewers,
  deliveryDate,
  colorId,
  onColorChange,
}: {
  saree: Saree;
  mrp?: number;
  badge?: string;
  viewers: number;
  deliveryDate: string;
  colorId: string;
  onColorChange: (id: string) => void;
}) {
  const { addToCart, inCart, updateCartQty, cartItems, toggleWishlist, inWishlist, hydrated } = useShop();
  const { openCart } = useCartDrawer();
  const { openCheckout } = useCheckoutModal();
  const { openLogin } = useLoginModal();
  const { user, hydrated: authHydrated } = useAuth();

  // Express-checkout: drop the saree into the cart (if not already there)
  // and open the checkout popup. Gated — opens the login modal first if
  // the user isn't signed in, then resumes via the post-login callback.
  // Quantity picker state. Clamped between 1 and the selected variant's live
  // stock when a colour is picked; falls back to a conservative 10-piece
  // ceiling when no colour is picked yet so the shopper can still nudge the
  // number up without risking an over-order (if they later pick a variant
  // with less stock, we re-clamp on next render).
  const [quantity, setQuantity] = useState(1);
  const handleBuyItNow = () => {
    if (!authHydrated) return;
    const proceed = () => {
      // Target the specific colour line when a swatch is picked; otherwise
      // the vid-less "pick at checkout" line. `inCart` with vid narrows to
      // that exact line so Buy It Now doesn't double-add when the shopper
      // already has a different colour of this same saree bagged.
      const vid = colorId || null;
      if (!inCart(saree.id, vid)) addToCart(saree.id, quantity, vid);
      openCheckout();
    };
    if (!user) {
      openLogin(proceed);
      return;
    }
    proceed();
  };
  const colorways = useMemo(() => getColorways(saree), [saree]);
  // `null` until the shopper actually picks a swatch — the gallery on
  // the left shows the product-level main image on first paint, and only
  // after a swatch click does the swatch highlight + gallery swap.
  const selectedColor = colorId ? colorways.find((c) => c.id === colorId) ?? null : null;
  // Out-of-stock gate on the CTAs. Only fires when a swatch is picked —
  // first paint keeps the buttons live so the shopper can at least click
  // Add to Cart before choosing a colour. If the picked variant has zero
  // stock, both Add to Cart and Buy It Now swap to a disabled
  // "Out of Stock" state.
  const selectedVariant = colorId ? saree.variants?.find((v) => v.id === colorId) ?? null : null;
  // OOS gate on the CTAs. Two conditions:
  //   1. A specific variant is picked and its live piece count is 0 — the
  //      original per-colour guard.
  //   2. No variant is picked yet BUT every variant across the product has
  //      live stock 0 — i.e. isSoldOut() === true. Without this, the "Add
  //      to Cart" / "Buy It Now" CTAs stayed live on a sold-out product
  //      until the shopper clicked a swatch, and the cart would end up
  //      with an unshippable line that order creation would then 409 on.
  const productSoldOut = isSoldOut(saree);
  const isSelectedOutOfStock =
    (Boolean(selectedVariant) && (selectedVariant?.stock ?? 0) <= 0) ||
    (!selectedVariant && productSoldOut);
  // Re-clamp quantity state when the picked variant's stock drops below the
  // current typed value — e.g. "pick Red (stock 5), bump qty to 5, switch to
  // Blue (stock 2)" must land at 2, not silently add 5 of Blue.
  useEffect(() => {
    const cap = Math.max(1, selectedVariant?.stock ?? 10);
    setQuantity((q) => Math.min(q, cap));
  }, [selectedVariant?.stock]);
  // Same-weave variants for the "More in ..." strip — pulled from the live
  // catalog so new admin products show up as siblings without a rebuild.
  // First entry is this saree itself; the rest are same-weave live sarees
  // ranked by palette proximity.
  const { sarees: liveSarees } = useLiveSarees();
  const variants = useMemo(() => getPdpVariants(saree, liveSarees), [saree, liveSarees]);
  const [blouseOption, setBlouseOption] = useState<'unstitched' | 'stitched'>('unstitched');
  const [shareNote, setShareNote] = useState<string | null>(null);

  const discount = mrp ? Math.round(((mrp - saree.price) / mrp) * 100) : 0;
  const stitchingFee = blouseOption === 'stitched' ? 800 : 0;
  const total = saree.price + stitchingFee;



  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: saree.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
      setTimeout(() => setShareNote(null), 1800);
    } catch {
      /* user cancelled */
    }
  };

  const saved = hydrated && inWishlist(saree.id);

  return (
    <div className="lg:sticky lg:top-[200px]">
      {/* Title row + heart + share */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <h1 className="text-[1.6rem] md:text-[1.75rem] font-bold text-gray-900 leading-tight flex-1">
          {saree.name}
        </h1>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => toggleWishlist(saree.id)}
            aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
            aria-pressed={saved}
            className="p-2 text-gray-700 hover:text-maroon-deep transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.8 6.6a5.5 5.5 0 0 0-9-1.7l-.8.8-.8-.8a5.5 5.5 0 1 0-7.8 7.8l8.6 8.5 8.6-8.5a5.5 5.5 0 0 0 1.2-6.1Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-label="Share"
            className="p-2 text-gray-700 hover:text-gray-900 transition-colors relative"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
            </svg>
            {shareNote && (
              <span className="absolute top-full right-0 mt-1 bg-gray-900 text-white text-[0.65rem] px-2 py-0.5 whitespace-nowrap">
                {shareNote}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Style number */}
      <div className="text-xs text-gray-500 mb-3">
        Style No <span className="text-gray-700 font-medium">{saree.id.toUpperCase()}</span>
      </div>

      {/* Admin marketing badges (Selling Fast, Ready to Ship, etc.) are
          suppressed on a sold-out product — they contradict the "Out of
          Stock" messaging and would make a dead listing look live. The
          CTAs below collapse to the disabled chip regardless, but the
          top-of-page chip has to agree. */}
      {badge && !productSoldOut && (
        <div
          className="inline-block text-white px-3.5 py-1 text-[0.7rem] font-semibold tracking-[0.12em] uppercase mb-4 shadow-[0_1px_2px_rgba(77,0,21,0.18)]"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #B07A2A 0%, #8A5A1F 35%, #7A1F2E 70%, #4D0015 100%)',
          }}
        >
          {badge}
        </div>
      )}

      {/* Price — Kalki pattern: amount + "Inclusive Of All Taxes" sit on
          the same line, with the MRP / discount stacked underneath. */}
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <span className="text-[1.75rem] font-semibold text-gray-900 tabular-nums">
          {formatINR(saree.price)}
        </span>
        <span className="text-xs text-gray-500">Inclusive Of All Taxes</span>
      </div>
      {mrp && (
        <div className="flex items-baseline gap-2 flex-wrap mb-6 text-sm">
          <span className="text-gray-500 line-through tabular-nums">
            MRP {formatINR(mrp)}
          </span>
          <span className="font-semibold text-scarlet tabular-nums">
            {discount}% OFF
          </span>
        </div>
      )}

      {/* Same-weave variant strip — a true "more colours" row in the
          sense a saree customer expects: every tile is another piece
          in THIS weave (Mangalagiri, Kanjeevaram, etc.), ranked by
          palette proximity. First tile is this saree (active, not a
          link); the rest link to their own PDP.
          Suppressed when the saree's weave is "Fancy Sarees" — that's
          the fallback bucket from normaliseWeave() for any product
          whose admin-set weave isn't one of the known types. Grouping
          those under "More in Fancy Sarees" surfaces an unrelated
          cross-category row, so the strip hides and the PDP reads
          cleanly, matching Banarasi / Kanjivaram / etc. */}
      {saree.weave !== 'Fancy Sarees' && variants.length > 1 && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[0.7rem] font-bold tracking-[0.18em] uppercase text-gray-900">
              More in {saree.weave}
            </span>
            <span aria-hidden className="h-px w-5 bg-gold/70" />
            <span className="font-display italic text-[0.95rem] text-maroon-deep">
              {saree.name}
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-2.5">
            {variants.map((v) => {
              const active = v.id === saree.id;
              const safeHref = navHref(`/shop/${v.id}`);
              const tile = (
                <>
                  <span
                    className={`relative block w-14 h-[72px] overflow-hidden bg-bone transition-all ${
                      active
                        ? 'ring-1 ring-maroon-deep ring-offset-2 ring-offset-white'
                        : 'ring-1 ring-black/15 group-hover:ring-black/45'
                    }`}
                  >
                    <Image
                      src={getProductHero(v)}
                      alt=""
                      fill
                      sizes="56px"
                      className={`object-cover transition-all duration-300 ${
                        active
                          ? 'scale-105'
                          : 'saturate-[0.85] group-hover:saturate-100 group-hover:scale-105'
                      }`}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        boxShadow:
                          'inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.22)',
                      }}
                    />
                  </span>
                  <span
                    aria-hidden
                    className={`h-[2px] w-6 transition-all ${
                      active ? 'bg-maroon-deep' : 'bg-transparent'
                    }`}
                  />
                </>
              );
              if (active || !safeHref) {
                return (
                  <div
                    key={v.id}
                    aria-current={active ? 'page' : undefined}
                    title={active ? `${v.name} (current)` : v.name}
                    className="group flex flex-col items-center gap-1.5 cursor-default"
                  >
                    {tile}
                  </div>
                );
              }
              return (
                <Link
                  key={v.id}
                  href={safeHref}
                  aria-label={`View ${v.name}`}
                  title={v.name}
                  className="group flex flex-col items-center gap-1.5 focus:outline-none"
                >
                  {tile}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Blouse stitching — hidden from the PDP for now. The underlying
          `blouseOption` state + `stitchingFee` calc still live on the
          component (default 'unstitched' → fee ₹0), so re-enabling this
          block is a pure uncomment — no state or pricing wiring needed. */}
      {/*
      <div className="mb-5">
        <div className="text-sm font-semibold text-gray-900 mb-2">
          Blouse Stitching Option
        </div>
        <div className="grid grid-cols-2 gap-2 max-w-[420px]">
          <button
            type="button"
            onClick={() => setBlouseOption('unstitched')}
            className={`py-3 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] border transition-colors ${
              blouseOption === 'unstitched'
                ? 'border-gray-900 bg-ink text-white'
                : 'border-gray-300 bg-white text-gray-900 hover:border-gray-900'
            }`}
          >
            Unstitched Blouse
          </button>
          <button
            type="button"
            onClick={() => setBlouseOption('stitched')}
            className={`py-3 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] border transition-colors ${
              blouseOption === 'stitched'
                ? 'border-gray-900 bg-ink text-white'
                : 'border-gray-300 bg-white text-gray-900 hover:border-gray-900'
            }`}
          >
            Custom Tailored (+₹800)
          </button>
        </div>
      </div>
      */}

      {/* Estimated delivery — Kalki pattern: "Delivered by : Wed, 18 Nov"
          with a simple truck glyph, no coloured banner. */}
      <div className="mt-5 flex items-center gap-2.5 text-sm text-gray-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700 shrink-0" aria-hidden>
          <path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z" />
          <circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" />
        </svg>
        <span>
          Delivered by :{' '}
          <strong className="font-semibold text-gray-900">{deliveryDate}</strong>
        </span>
      </div>

      {/* Colour picker — one swatch per admin-defined colour variant.
          Shows the currently selected colour's name above the row (or a
          "Select a colour" prompt before the shopper picks one), flags
          out-of-stock variants with a diagonal strike and dimmed opacity,
          and lifts onColorChange so the left gallery swaps to the picked
          colour's images. Only rendered when the admin has defined
          variants (static sarees fall back to palette colours which
          aren't individually orderable, so no picker there). */}
      {colorways.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-[0.7rem] font-bold tracking-[0.18em] uppercase text-gray-900">
              Colour
            </span>
            <span className="text-sm text-gray-700">
              {selectedColor ? selectedColor.name : <span className="text-gray-500 italic">Pick a colour to view</span>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {colorways.map((c) => {
              const active = c.id === (selectedColor?.id ?? '');
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onColorChange(c.id)}
                  title={c.name}
                  aria-label={`Pick ${c.name}`}
                  aria-pressed={active}
                  className={`relative w-9 h-9 rounded-full transition-all ${
                    active
                      ? 'ring-2 ring-maroon-deep ring-offset-2 ring-offset-white'
                      : 'ring-1 ring-black/15 hover:ring-black/45'
                  }`}
                  style={{ background: c.hex }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity selector — compact −/+/number row that sits above the
          CTAs. Max is the selected variant's live stock when a colour has
          been picked, or a 10-piece ceiling otherwise. The input itself
          accepts typed digits but is clamped on blur so a 5-digit paste
          doesn't slip through. Hidden when the selected variant is out of
          stock because the CTAs collapse to "Out of Stock" anyway. */}
      {!isSelectedOutOfStock && (() => {
        const maxQty = Math.max(1, selectedVariant?.stock ?? 10);
        // Target the cart line that matches the currently selected colour
        // (or the vid-less one when no swatch is picked). Previously the
        // picker drove ANY cart line for this saree, so picking a new
        // colour on a saree already bagged in a different colour would
        // silently overwrite the bagged line's qty.
        const vid = colorId || null;
        const cartLine = hydrated
          ? cartItems.find((i) => i.saree.id === saree.id && (i.variant?.id ?? null) === vid)
          : null;
        const activeQty = cartLine ? cartLine.qty : quantity;
        const clamped = Math.max(1, Math.min(maxQty, activeQty));
        const setQty = (n: number) => {
          const v = Math.max(1, Math.min(maxQty, n));
          if (cartLine) updateCartQty(saree.id, v, vid);
          else setQuantity(v);
        };
        const dec = () => setQty(clamped - 1);
        const inc = () => setQty(clamped + 1);
        return (
          <div className="mt-5 max-w-[420px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-gray-700">
                Quantity
              </span>
              <div className="flex items-stretch border border-gray-300">
                <button
                  type="button"
                  onClick={dec}
                  disabled={clamped <= 1}
                  aria-label="Decrease quantity"
                  className="w-10 h-10 flex items-center justify-center text-ink hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={clamped}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                    if (Number.isFinite(n) && n > 0) setQty(n);
                    else if (e.target.value === '') setQty(1);
                  }}
                  onBlur={() => setQty(clamped)}
                  aria-label="Quantity"
                  className="w-12 text-center border-x border-gray-300 text-sm font-semibold text-ink tabular-nums focus:outline-none bg-white"
                />
                <button
                  type="button"
                  onClick={inc}
                  disabled={clamped >= maxQty}
                  aria-label="Increase quantity"
                  className="w-10 h-10 flex items-center justify-center text-ink hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
              </div>
            </div>
            {selectedVariant && (selectedVariant.stock ?? 0) > 0 && (() => {
              // Stock signal below the quantity picker, rendered as a tinted
              // pill so it reads as its own callout and not as body copy.
              // Low stock (≤5) swaps to a red/maroon palette for urgency;
              // comfortable stock stays in a neutral amber so the number is
              // visible but not alarmist.
              const stock = selectedVariant.stock ?? 0;
              const isLow = stock <= 5;
              return (
                <div
                  role="status"
                  className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] font-semibold tracking-wide rounded-sm border ${
                    isLow
                      ? 'bg-maroon/10 text-maroon border-maroon/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
                      : 'bg-amber-50 text-amber-800 border-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
                  }`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                    className={isLow ? 'animate-pulse' : ''}
                  >
                    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
                  </svg>
                  <span>
                    Only <span className="tabular-nums font-bold">{stock}</span>{' '}
                    {stock === 1 ? 'piece' : 'pieces'} left in this colour.
                  </span>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* CTAs — Kalki PDP uses chunky full-width buttons that read as
          the page's primary actions. When the selected colour is out of
          stock, both buttons collapse to a disabled "Out of Stock" chip
          so the shopper can't accidentally add an unshippable variant. */}
      <div className="mt-5 grid gap-3 max-w-[420px]">
        {isSelectedOutOfStock ? (
          <button
            type="button"
            disabled
            aria-disabled
            className="w-full border border-gray-300 bg-gray-100 text-gray-500 py-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] cursor-not-allowed flex items-center justify-center gap-2.5"
          >
            Out of Stock
          </button>
        ) : (() => {
          // "Added · View Bag" lights up only when a line for the
          // currently-picked colour (or the vid-less one before any pick)
          // is in the bag. A red version in cart shouldn't claim that the
          // blue the shopper is now viewing is already "added".
          const vid = colorId || null;
          const cartLine = hydrated
            ? cartItems.find((i) => i.saree.id === saree.id && (i.variant?.id ?? null) === vid)
            : null;
          const effectiveQty = cartLine ? cartLine.qty : quantity;
          return (
            <>
              {cartLine ? (
                <button
                  type="button"
                  onClick={openCart}
                  className="w-full border border-emerald-700 text-emerald-700 bg-white py-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] hover:bg-emerald-700 hover:text-white transition-colors flex items-center justify-center gap-2.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5 10 17.5 19.5 8" />
                  </svg>
                  <span>Added · View Bag</span>
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="tabular-nums">{formatINR(total * effectiveQty)}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => addToCart(saree.id, quantity, colorId || null)}
                  className="w-full border border-gray-900 text-gray-900 bg-white py-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] hover:bg-gray-900 hover:text-white transition-colors flex items-center justify-center gap-2.5"
                >
                  <span>Add to Cart</span>
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="tabular-nums">{formatINR(total * quantity)}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleBuyItNow}
                className="w-full bg-ink text-white py-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] hover:bg-maroon-deep transition-colors"
              >
                Buy It Now
              </button>
            </>
          );
        })()}
      </div>

    </div>
  );
}
