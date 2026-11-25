'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatINR, TIERS, type Saree } from '@/lib/sarees';
import { useLiveSarees } from '@/lib/catalog';
import WishlistButton from '@/components/shop/WishlistButton';
import ViewSimilarButton from '@/components/shop/ViewSimilarButton';
import AddToCartButton from '@/components/shop/AddToCartButton';
import SectionHeader from '@/components/home/SectionHeader';
import { navHref } from '@/lib/soft-launch';

type Tab = 'new' | 'bridal' | 'festive' | 'everyday';

// Match against admin-tagged occasions (case-insensitive). A product's
// `occasions` array can hold parent names ("Festive"), sub-occasion names
// ("Diwali"), or both — the tab shows it as long as any entry matches the
// tab label.
//
// The price-tier bucket (bridal / festive / everyday) ALSO counts as a
// match, even when occasions are tagged. This mirrors the card's tier
// overlay — without it a saree whose tier is 'bridal' but whose only
// occasion tag is 'festive' would show "BRIDAL" on the card under the
// Festive tab yet vanish when the shopper clicked Bridal.
const hasOccasion = (s: Saree, name: string) => {
  const needle = name.toLowerCase();
  const occs = (s.occasions || []).map((o) => o.toLowerCase());
  if (occs.some((o) => o.includes(needle))) return true;
  if (s.tier === needle) return true;
  return false;
};

const tabs: { id: Tab; label: string; filter: (s: Saree) => boolean }[] = [
  { id: 'new', label: 'New In', filter: () => true },
  { id: 'bridal', label: 'Bridal', filter: (s) => hasOccasion(s, 'bridal') },
  { id: 'festive', label: 'Festive', filter: (s) => hasOccasion(s, 'festive') },
  { id: 'everyday', label: 'Everyday', filter: (s) => hasOccasion(s, 'everyday') },
];

// Per-saree rating + review counts. These are display-only stats — when
// the backend lands, this map gets replaced with values from the API
// (or moved onto the saree record itself, alongside mrp / badges).
// IMPORTANT: never invent display names / prices for catalog sarees
// here — the card's <Link href={`/shop/${saree.id}`}> binds to the real
// saree, so a fake display name would mismap the card to the wrong
// detail page AND collide with real catalog entries of the same name.
const productMeta: Record<string, { rating: number; reviews: number }> = {
  'banarasi-raktarani': { rating: 4.9, reviews: 142 },
  'kanjivaram-mayura': { rating: 4.8, reviews: 89 },
  'patola-rasleela': { rating: 5.0, reviews: 34 },
  'mixedpattu-katha': { rating: 4.8, reviews: 56 },
  'kanjivaram-neelambari': { rating: 4.8, reviews: 71 },
  'mixedpattu-mor': { rating: 4.9, reviews: 64 },
  'patola-vrindavan': { rating: 4.9, reviews: 48 },
  'mixedpattu-ramayana': { rating: 4.7, reviews: 53 },
  'fancy-haldi': { rating: 4.9, reviews: 76 },
  'mysore-chandrika': { rating: 4.7, reviews: 121 },
  'banarasi-jamawar': { rating: 4.8, reviews: 67 },
  'mangalagiri-megha': { rating: 4.6, reviews: 98 },
  'banarasi-sindhoori': { rating: 4.7, reviews: 82 },
  'kanjivaram-surya': { rating: 4.6, reviews: 74 },
  'mysore-mallika': { rating: 4.6, reviews: 109 },
  'gadwal-konark': { rating: 4.7, reviews: 88 },
  'patola-rangraj': { rating: 4.5, reviews: 41 },
  'gadwal-krishna': { rating: 4.7, reviews: 58 },
  'mangalagiri-chandni': { rating: 4.6, reviews: 73 },
  'pochampally-aakash': { rating: 4.7, reviews: 203 },
  'mangalagiri-tulsi': { rating: 4.5, reviews: 178 },
  'mysore-tara': { rating: 4.5, reviews: 145 },
  'banarasi-saanjh': { rating: 4.6, reviews: 89 },
  'kanjivaram-lavanya': { rating: 4.6, reviews: 96 },
  'pochampally-bandhakala': { rating: 4.7, reviews: 134 },
};

export default function Featured() {
  const [tab, setTab] = useState<Tab>('new');
  // Tabs filter the whole live catalogue by tier (Bridal / Festive /
  // Everyday), with "New In" showing only products the admin has flagged
  // with the `newin` badge. No cross-intersection — each tab is a clean
  // view of what sits in that category.
  const { sarees: liveSarees, loading: sareesLoading } = useLiveSarees();
  const items = (
    tab === 'new'
      ? liveSarees.filter((s) => s.badges.includes('newin'))
      : liveSarees.filter(tabs.find((t) => t.id === tab)!.filter)
  ).slice(0, 12);
  const showSkeleton = sareesLoading || items.length === 0;

  // Horizontal carousel scroll controls — mirrors the ProductRail
  // pattern used elsewhere. Arrows disable when there's nothing to
  // scroll to on either side; the track itself is a scroll-snap row
  // so finger / trackpad swipes land on card edges.
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const update = () => {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items.length, tab, showSkeleton]);
  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector('[data-featured-card]') as HTMLElement | null;
    const step = (card?.offsetWidth ?? 240) + 16;
    el.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
  };

  return (
    <section className="bg-bone py-10 md:py-14">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <SectionHeader
          title="New Arrivals"
          description="Fresh off the loom — the latest heirloom weaves added to the house, across bridal, festive and everyday edits."
          link={{ href: '/shop?sort=new', label: 'View All' }}
          showDividers={false}
        />

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-6 md:mb-8 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-sm px-5 py-2.5 font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-maroon-deep text-ivory'
                  : 'bg-transparent text-ink border border-ink/25 hover:border-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Carousel controls — hidden on mobile where the user swipes
            the track directly. Disabled when there's no room to scroll
            on that side. */}
        <div className="hidden md:flex items-center justify-end gap-2 mb-3">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            aria-label="Scroll left"
            className="w-9 h-9 border border-ink/25 flex items-center justify-center text-ink hover:bg-maroon-deep hover:text-ivory hover:border-maroon-deep disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-sm"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            aria-label="Scroll right"
            className="w-9 h-9 border border-ink/25 flex items-center justify-center text-ink hover:bg-maroon-deep hover:text-ivory hover:border-maroon-deep disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-sm"
          >
            ›
          </button>
        </div>

        <div
          ref={railRef}
          className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2"
        >
          {showSkeleton
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`feat-skel-${i}`}
                  data-featured-card
                  className="shrink-0 w-[calc((100%-0.75rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] snap-start bg-white rounded-sm overflow-hidden"
                  aria-hidden
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-ink/5 animate-pulse" />
                  <div className="p-3 md:p-3.5 space-y-2">
                    <div className="h-3 w-1/3 bg-ink/5 rounded-sm animate-pulse" />
                    <div className="h-4 w-3/4 bg-ink/5 rounded-sm animate-pulse" />
                    <div className="h-4 w-1/2 bg-ink/5 rounded-sm animate-pulse" />
                  </div>
                </div>
              ))
            : items.map((saree) => {
            const tier = TIERS[saree.tier];
            const meta = productMeta[saree.id] ?? { rating: 4.7, reviews: 50 };
            const discount =
              saree.mrp > saree.price
                ? Math.round(((saree.mrp - saree.price) / saree.mrp) * 100)
                : 0;
            const productHref = navHref(`/shop/${saree.id}`);
            const CardTag = productHref ? Link : 'span';
            // Sized so the carousel shows 2 cards on mobile, 3 on
            // tablet, 4 on desktop at any one time. The calc() widths
            // subtract the gap between cards so the fourth card lines
            // up with the right edge of the track instead of overflowing.
            const cardSize =
              'shrink-0 w-[calc((100%-0.75rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] snap-start';
            const cardProps = productHref
              ? { href: productHref, 'data-featured-card': true, className: `group block bg-white rounded-sm overflow-hidden ${cardSize}` }
              : { 'data-featured-card': true, className: `group block bg-white rounded-sm overflow-hidden cursor-default ${cardSize}` };
            return (
              <CardTag
                key={saree.id}
                {...(cardProps as { href: string; className: string })}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                  {saree.image && (
                    <Image
                      src={saree.image}
                      alt={saree.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute top-2.5 left-2.5 bg-ivory/95 no-pattern backdrop-blur-sm px-2 py-1 text-[0.65rem] font-semibold text-ink uppercase tracking-wide rounded-sm">
                    {tier.title}
                  </div>
                  {discount > 0 && (
                    <div className="absolute bottom-2.5 right-2.5 bg-maroon-deep text-ivory px-2 py-1 text-[0.65rem] font-bold rounded-sm">
                      {discount}% OFF
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
                  {/* Hover Add-to-Bag pill — Nalli-style compact chip
                      floating at the bottom-left of the image, revealed on
                      card hover. White fill + dark text with a soft shadow
                      reads as a quiet secondary CTA, not a loud bar. */}
                  <div className="absolute bottom-2.5 left-2.5 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 pointer-events-none">
                    <div className="pointer-events-auto">
                      <AddToCartButton
                        productId={saree.id}
                        variant="compact"
                        className="!bg-white !text-ink hover:!bg-ivory !px-3.5 !py-1.5 shadow-md border border-ink/10 !text-[0.7rem] !tracking-wide"
                      >
                        Add to Bag
                      </AddToCartButton>
                    </div>
                  </div>
                </div>
                <div className="p-3 md:p-3.5">
                  <div className="text-[0.7rem] text-ink/55 font-medium mb-1">
                    {saree.weave}
                  </div>
                  <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-1 mb-2">
                    {saree.name}
                  </h3>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex items-center gap-1 bg-bone text-ink px-1.5 py-0.5 rounded-sm">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-gold-deep" aria-hidden>
                        <path d="m12 2 2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1L12 2Z" />
                      </svg>
                      <span className="text-[0.7rem] font-semibold">{meta.rating}</span>
                    </div>
                    <span className="text-[0.7rem] text-ink/55">({meta.reviews})</span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <span className="text-base font-bold text-ink">{formatINR(saree.price)}</span>
                      {saree.mrp > saree.price && (
                        <span className="text-xs text-ink/45 line-through">{formatINR(saree.mrp)}</span>
                      )}
                    </div>
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

        <div className="mt-8 flex justify-center">
          {navHref('/shop?sort=new') ? (
            <Link
              href="/shop?sort=new"
              className="inline-flex items-center gap-2 bg-maroon-deep text-ivory px-8 py-3 text-sm font-bold uppercase tracking-wider rounded-sm hover:bg-maroon transition-colors"
            >
              View All Sarees
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 bg-maroon-deep text-ivory px-8 py-3 text-sm font-bold uppercase tracking-wider rounded-sm cursor-default">
              View All Sarees
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
