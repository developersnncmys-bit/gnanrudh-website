'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { navHref } from '@/lib/soft-launch';
import SectionHeader from '@/components/home/SectionHeader';
import { priceRangesApi, type ServerPriceRange } from '@/lib/api';

type Bucket = {
  label: string;
  sub: string;
  tagline: string;
  href: string;
  // Admin-uploaded tile image. When absent, the card renders a clean
  // empty-frame placeholder — no sample-saree fallback.
  image?: string;
};

const inr = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN').format(Math.round(n))}`;

const bandLabel = (min: number, max: number | null) => {
  if (max == null) return `${inr(min)} & Above`;
  if (!min) return `Under ${inr(max)}`;
  return `${inr(min)} – ${inr(max)}`;
};

const bandHref = (min: number, max: number | null) => {
  if (max == null) return `/shop?minPrice=${Math.round(min)}`;
  if (!min) return `/shop?maxPrice=${Math.round(max)}`;
  return `/shop?minPrice=${Math.round(min)}&maxPrice=${Math.round(max)}`;
};

function mapRange(r: ServerPriceRange): Bucket {
  const title = (r.title || '').trim() || r.label;
  return {
    label: title,
    sub: r.label || bandLabel(r.min, r.max),
    tagline: (r.description || '').trim(),
    href: bandHref(r.min || 0, r.max ?? null),
    image: r.image && r.image.trim() ? r.image : undefined,
  };
}

// Small cream decorative mark that sits at the bottom of each card,
// just above the tagline — a quiet bloom glyph so the frame reads as
// an altar doorway rather than a plain photo.
function ArchOrnament() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-5 h-5 text-ivory/90 mx-auto"
      fill="currentColor"
    >
      <path d="M12 2.5c.8 1.9 1 3.1.6 4.3 1.2-.5 2.4-.5 4.3.3-1.5.6-2.5 1.2-3 2.3 1.3.1 2.4.6 3.6 2.1-1.6-.1-2.9.1-3.8.9.9.8 1.5 1.9 1.6 3.6-1.3-1.1-2.5-1.7-3.6-1.6-.1 1.2-.6 2.4-2.1 3.6-.1-1.6-.5-2.7-1.4-3.6-.9.8-2 1.3-3.6 1.4.9-1.2 1.4-2.4 1.3-3.6-1.2-.1-2.3-.6-3.4-1.9 1.6-.1 2.7-.5 3.4-1.4-.8-.9-1.2-2-1.2-3.5 1.2 1.1 2.3 1.5 3.4 1.3-.2-1.1 0-2.2.6-3.2.7.9 1.3 2.1 1.9 3.3Z" />
      <circle cx="12" cy="12" r="1.3" />
    </svg>
  );
}

export default function ShopByPrice() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  useEffect(() => {
    let alive = true;
    priceRangesApi.list()
      .then((res) => {
        if (!alive) return;
        const rows = res.items || [];
        setBuckets(rows.map(mapRange));
      })
      .catch(() => { /* leave empty — no static fallback */ });
    return () => { alive = false; };
  }, []);

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
  }, [updateButtons, buckets.length]);

  // Advance exactly one card per click — measure the first card's actual
  // width and add the flex gap (20 / 24 px at the two breakpoints) so the
  // next tile snaps to the leading edge instead of overshooting.
  const scrollByCard = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const gap = parseFloat(window.getComputedStyle(el).columnGap || '0') || 20;
    const step = first.getBoundingClientRect().width + gap;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <SectionHeader
          title="Shop by Price"
          description="From everyday cotton drapes to heirloom bridal silks — a curated price edit for every occasion and every budget."
          link={{ href: '/shop?sort=new', label: 'View All' }}
          showDividers={false}
        />

        {/* Arrow controls — only meaningful once there are more than four
            buckets to slide through. Hidden on mobile where native swipe
            handles navigation. */}
        {buckets.length > 4 && (
          <div className="hidden md:flex items-center gap-2 justify-end mb-4">
            <button
              onClick={() => scrollByCard(-1)}
              disabled={!canPrev}
              aria-label="Previous price range"
              className="w-10 h-10 rounded-full border border-ink/20 flex items-center justify-center text-ink hover:bg-maroon hover:text-ivory hover:border-maroon disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <LuChevronLeft size={18} strokeWidth={2} aria-hidden />
            </button>
            <button
              onClick={() => scrollByCard(1)}
              disabled={!canNext}
              aria-label="Next price range"
              className="w-10 h-10 rounded-full border border-ink/20 flex items-center justify-center text-ink hover:bg-maroon hover:text-ivory hover:border-maroon disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <LuChevronRight size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}

        <div
          ref={railRef}
          className="flex gap-5 md:gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory pt-2 pb-2"
        >
          {buckets.map((b) => {
            const bucketHref = navHref(b.href);
            const BucketTag = bucketHref ? Link : 'span';
            // Fixed basis so the flex rail shows exactly 2 cards on mobile
            // and 4 on md+, matching the gap values on the rail (20 / 24 px).
            const cardSizing =
              'shrink-0 basis-[calc(50%-10px)] md:basis-[calc(25%-18px)] snap-start';
            const bucketProps = bucketHref
              ? {
                  href: bucketHref,
                  className: `group block text-center ${cardSizing}`,
                }
              : {
                  className: `group block text-center cursor-default ${cardSizing}`,
                };
            // Admin-uploaded tile only — no sample-saree fallback.
            const imageSrc = b.image;
            return (
              <BucketTag
                key={b.label}
                {...(bucketProps as { href: string; className: string })}
              >
                {/* Rectangular wooden frame — deep mahogany gradient
                    around the saree photo with inner + outer shadow for
                    depth. Slight rounded corners keep it feeling premium. */}
                <div
                  className="relative aspect-[2/3] p-[6px] md:p-[8px] rounded-sm transition-transform duration-500 group-hover:-translate-y-1"
                  style={{
                    background:
                      'linear-gradient(145deg, #5a361f 0%, #2d1810 50%, #4a2918 100%)',
                    boxShadow:
                      'inset 0 -2px 10px rgba(0,0,0,0.35), 0 10px 24px rgba(42,22,16,0.25)',
                  }}
                >
                  {/* Inner photo — a hairline of dark wood stays visible
                      around the saree as the "matting". */}
                  <div className="relative w-full h-full overflow-hidden bg-bone rounded-sm">
                    {imageSrc && (
                      <Image
                        src={imageSrc}
                        alt={b.label}
                        fill
                        sizes="(max-width: 768px) 46vw, 22vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}

                    {/* Dark gradient so the cream tagline reads against
                        any photo underneath. Stronger at the bottom
                        where the ornament + tagline sit. */}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent pointer-events-none" />

                    {/* Ornament + italic tagline — cream, centered at the
                        bottom of the card. Only rendered when the admin
                        has written a tagline for this bucket. */}
                    {b.tagline && (
                      <div className="absolute inset-x-0 bottom-5 md:bottom-7 px-4 flex flex-col items-center gap-2">
                        <ArchOrnament />
                        <p className="font-display italic text-[0.78rem] md:text-sm text-ivory leading-snug max-w-[80%]">
                          {b.tagline}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Category title sits BELOW the frame, with the price
                    band as a quieter sub-line. */}
                <h3 className="font-display text-base md:text-lg font-bold text-ink uppercase tracking-[0.18em] mt-4 group-hover:text-maroon transition-colors">
                  {b.label}
                </h3>
                <div className="mt-1 text-xs md:text-sm text-ink/60">
                  {b.sub}
                </div>
              </BucketTag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
