'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatINR, TIERS, type Saree } from '@/lib/sarees';
import { useLiveSarees } from '@/lib/catalog';
import WishlistButton from '@/components/shop/WishlistButton';
import AddToCartButton from '@/components/shop/AddToCartButton';
import ViewSimilarButton from '@/components/shop/ViewSimilarButton';
import { navHref } from '@/lib/soft-launch';

// Anything at or below this count is treated as "selling fast". Backend's
// overlayLiveStock on /api/public/products rewrites each variant's stock
// field with the real count of pieces in "In stock" status, so this
// threshold is applied against live inventory — not stale seed values.
const LOW_STOCK_THRESHOLD = 5;
// Kept at 10 so the desktop view of 5-per-row scrolls cleanly to a second
// page of 5. Set as a cap; if fewer than 10 products are low-stock the
// rail just shows what qualifies.
const MAX_CARDS = 10;

// Sum the live stock across every colour variant. Products with no variants
// or no stock field get a `null` sentinel so they're excluded from the
// "low stock" rail — we don't want sarees with unknown inventory showing
// up next to accurate counts.
function totalStock(s: Saree): number | null {
  if (!s.variants || s.variants.length === 0) return null;
  let sum = 0;
  let anyKnown = false;
  for (const v of s.variants) {
    if (typeof v.stock === 'number') {
      sum += v.stock;
      anyKnown = true;
    }
  }
  return anyKnown ? sum : null;
}

export default function PressStrip() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateButtons = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateButtons();
    const el = railRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    return () => {
      el.removeEventListener('scroll', updateButtons);
      window.removeEventListener('resize', updateButtons);
    };
  }, [updateButtons]);

  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    // Each card uses calc((100% - gaps)/N) so the rail always shows
    // exactly N full cards — advancing by clientWidth lands on the
    // next page cleanly.
    el.scrollBy({ left: dir * (el.clientWidth + 16), behavior: 'smooth' });
  };

  const { sarees: liveSarees, loading } = useLiveSarees();

  // Pick products whose total live stock is > 0 and ≤ threshold, then
  // surface the most urgent (lowest count) first so shoppers see the
  // scarcest items at the top of the rail. Sarees with unknown stock
  // (null from totalStock) drop out — we only show cards we can trust.
  const items = useMemo(() => {
    const scored: { saree: Saree; stock: number }[] = [];
    for (const s of liveSarees) {
      const stock = totalStock(s);
      if (stock === null) continue;
      if (stock <= 0 || stock > LOW_STOCK_THRESHOLD) continue;
      scored.push({ saree: s, stock });
    }
    scored.sort((a, b) => a.stock - b.stock);
    return scored.slice(0, MAX_CARDS);
  }, [liveSarees]);

  // Hide the whole section while the catalogue is still loading (to avoid
  // flashing a header with no cards) and when nothing qualifies as low
  // stock (common on a fresh DB or after a restock).
  if (loading || items.length === 0) return null;

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col items-center text-center mb-4 md:mb-6 gap-2">
          <span className="inline-flex items-center gap-2 bg-maroon/10 text-maroon px-3 py-1.5 text-xs font-bold uppercase tracking-wider">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-maroon opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-maroon" />
            </span>
            Low Stock
          </span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-ink">
            Selling fast
          </h2>
          <p className="max-w-xl text-sm md:text-base text-ink/60 leading-relaxed">
            Only a handful left — pieces our shoppers are reaching for this week.
            Once these are gone, each is one of a kind.
          </p>
          {navHref('/shop?sort=bestseller') ? (
            <Link
              href="/shop?sort=bestseller"
              className="text-sm font-semibold text-ink hover:text-maroon transition-colors underline underline-offset-4"
            >
              View All
            </Link>
          ) : (
            <span className="text-sm font-semibold text-ink underline underline-offset-4 cursor-default">
              View All
            </span>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end gap-2 mb-4">
          <button
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            aria-label="Scroll left"
            className="w-9 h-9 rounded-full border border-ink/20 flex items-center justify-center text-ink hover:bg-maroon-deep hover:text-ivory disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ‹
          </button>
          <button
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            aria-label="Scroll right"
            className="w-9 h-9 rounded-full border border-ink/20 flex items-center justify-center text-ink hover:bg-maroon-deep hover:text-ivory disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ›
          </button>
        </div>

        <div
          ref={railRef}
          className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2"
        >
          {items.map(({ saree, stock }) => {
            const tier = TIERS[saree.tier];
            const productHref = navHref(`/shop/${saree.id}`);
            const CardTag = productHref ? Link : 'span';
            const cardProps = productHref
              ? {
                  href: productHref,
                  'data-card': true,
                  className:
                    'group shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)] xl:w-[calc((100%-64px)/5)] snap-start bg-white',
                }
              : {
                  'data-card': true,
                  className:
                    'group shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)] xl:w-[calc((100%-64px)/5)] snap-start bg-white cursor-default block',
                };
            return (
              <CardTag
                key={saree.id}
                {...(cardProps as { href: string; className: string; 'data-card': true })}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-bone rounded-sm">
                  <Image
                    src={saree.image}
                    alt={saree.name}
                    fill
                    sizes="(max-width: 640px) 46vw, (max-width: 768px) 46vw, (max-width: 1024px) 30vw, (max-width: 1280px) 23vw, 18vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {stock <= 3 ? (
                    <div className="absolute top-2.5 left-2.5 bg-gold-deep text-ivory px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider rounded-sm">
                      Only {stock} Left
                    </div>
                  ) : (
                    <div className="absolute top-2.5 left-2.5 bg-ivory/95 no-pattern backdrop-blur-sm text-ink px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide rounded-sm">
                      {tier.title}
                    </div>
                  )}
                  <WishlistButton
                    productId={saree.id}
                    className="absolute top-2.5 right-2.5 w-9 h-9"
                    size={14}
                  />
                  <ViewSimilarButton
                    productId={saree.id}
                    className="sm:hidden !absolute bottom-2.5 left-2.5 w-9 h-9 z-10"
                    size={14}
                  />
                  {/* Add-to-bag pill — revealed on hover, sits at the
                      bottom of the image. Real button that calls the
                      shop store; stops propagation so the card's
                      wrapping Link doesn't fire. */}
                  <AddToCartButton
                    productId={saree.id}
                    variant="compact"
                    className="absolute left-3 right-3 bottom-3 !bg-ivory/95 !text-ink hover:!bg-white !py-2 !px-3 !text-[0.7rem] !tracking-wider shadow-md backdrop-blur-sm rounded-sm opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
                  >
                    Add to Bag
                  </AddToCartButton>
                </div>
                <div className="p-3">
                  <div className="text-[0.7rem] text-ink/55 font-medium mb-1">
                    {saree.weave}
                  </div>
                  <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-1 mb-2">
                    {saree.name}
                  </h3>
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-base font-bold text-ink">
                      {formatINR(saree.price)}
                    </span>
                    <ViewSimilarButton
                      productId={saree.id}
                      className="hidden sm:inline-flex w-8 h-8 shrink-0 !bg-transparent !backdrop-blur-none"
                      size={16}
                    />
                  </div>
                </div>
              </CardTag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
