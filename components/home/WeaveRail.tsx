'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SectionHeader from '@/components/home/SectionHeader';
import { SAREES } from '@/lib/sarees';
import { navHref } from '@/lib/soft-launch';
import { useLiveCategories, useLiveSarees } from '@/lib/catalog';

// Count of pieces per weave (for the "X pieces" badge)
const weaveCounts: Record<string, number> = {};
SAREES.forEach((s) => {
  weaveCounts[s.weave] = (weaveCounts[s.weave] ?? 0) + 1;
});

// Tile shape for the rail. `countKey` is what we look up piece counts
// against — the static weave key for fallback tiles, the category _id
// for live tiles (admin products store category as `cat` which maps to
// `region` on the Saree view-model, see transforms.ts).
type RailTile = {
  id: string;
  name: string;
  href: string;
  image?: string;
  place: string;
  countKey: string;
  countMode: 'weave' | 'region';
};

// Static weave catalog — used as a fallback when the admin hasn't
// defined any saree-flagged categories yet, or while the fetch is in
// flight. Mirrors the navbar order.
type Weave = {
  id: string;
  name: string;
  weaveKey: string; // matches the catalog's `weave` field
  image?: string;
  place: string;
};

const weaves: Weave[] = [
  {
    id: 'kanjivaram',
    name: 'Kanjeevaram',
    weaveKey: 'Kanjivaram',
    image: '/Byweaves/kanjeevaram.webp',
    place: 'Kanchipuram',
  },
  {
    id: 'banarasi',
    name: 'Banarasi',
    weaveKey: 'Banarasi',
    image: '/Byweaves/banarasi.webp',
    place: 'Varanasi',
  },
  {
    id: 'mysore',
    name: 'Mysore Silk',
    weaveKey: 'Mysore Silk',
    image: '/Byweaves/Mysore%20silk.webp',
    place: 'Mysuru',
  },
  {
    id: 'mangalagiri',
    name: 'Mangalagiri',
    weaveKey: 'Mangalagiri',
    image: '/Byweaves/mangalagiri.webp',
    place: 'Andhra Pradesh',
  },
  {
    id: 'pochampally',
    name: 'Pochampally',
    weaveKey: 'Pochampally',
    image: '/Byweaves/Pochampally.webp',
    place: 'Telangana',
  },
  {
    id: 'gadwal',
    name: 'Gadwal',
    weaveKey: 'Gadwal',
    image: '/Byweaves/Gadwal.webp',
    place: 'Telangana',
  },
  {
    id: 'patola',
    name: 'Patola',
    weaveKey: 'Patola',
    image: '/Byweaves/Patola.webp',
    place: 'Patan',
  },
  {
    id: 'fancy',
    name: 'Fancy Sarees',
    weaveKey: 'Fancy Sarees',
    image: '/Byweaves/fancy-saree.webp',
    place: 'Contemporary',
  },
  {
    id: 'mixed-pattu',
    name: 'Mixed Pattu Sarees',
    weaveKey: 'Mixed Pattu Sarees',
    image: '/Byweaves/Mixed-pattu.webp',
    place: 'Fusion drapes',
  },
];

export default function WeaveRail() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // Live admin categories drive the rail (with a static weave fallback so
  // first paint before the fetch lands looks curated). Products are only
  // used for the "N pieces" badge — when no products are live, counts show
  // 0 rather than a skeleton, because the category tiles still render.
  const { categories: liveCategories } = useLiveCategories();
  const { sarees: liveSarees } = useLiveSarees();

  const tiles: RailTile[] = useMemo(() => {
    if (liveCategories.length) {
      return liveCategories.map((c) => ({
        id: c._id,
        name: c.name,
        href: `/shop?cat=${encodeURIComponent(c._id)}`,
        image: c.image || undefined,
        // Surface the first associated weave underneath the heading,
        // matching the geography/style sub-label the static rail used.
        place: (c.weaves && c.weaves[0]) || '',
        countKey: c._id,
        countMode: 'region' as const,
      }));
    }
    return weaves.map((w) => ({
      id: w.id,
      name: w.name,
      href: `/shop?weave=${encodeURIComponent(w.weaveKey)}`,
      image: w.image,
      place: w.place,
      countKey: w.weaveKey,
      countMode: 'weave' as const,
    }));
  }, [liveCategories]);

  // `cat` on the server product maps to `region` on Saree (see
  // lib/transforms.ts), so category counts come from matching
  // saree.region against the category _id.
  const countFor = useCallback(
    (tile: RailTile) => {
      if (tile.countMode === 'weave') return weaveCounts[tile.countKey] ?? 0;
      return liveSarees.filter((s) => s.region === tile.countKey).length;
    },
    [liveSarees],
  );

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
    // Each tile uses calc((100% - gaps)/N) so the rail always shows
    // exactly N full tiles — advancing by clientWidth lands on the
    // next page cleanly.
    el.scrollBy({ left: dir * (el.clientWidth + 16), behavior: 'smooth' });
  };

  return (
    <section className="bg-bone py-10 md:py-14">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <SectionHeader
          title="Shop by Category"
          description="Nine weaving traditions, nine distinct voices — from Kanjeevaram silks to Patola ikats, hand-crafted across India."
          link={{ href: '/shop', label: 'View All' }}
          showDividers={false}
        />

        {/* Rail arrows — kept to the right, below the centered header. */}
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
          className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pt-3 pb-2"
        >
          {tiles.map((w) => {
            const count = countFor(w);
            const weaveHref = navHref(w.href);
            const WeaveTag = weaveHref ? Link : 'span';
            const weaveProps = weaveHref
              ? {
                  href: weaveHref,
                  'data-card': true,
                  className:
                    'group shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)] xl:w-[calc((100%-64px)/5)] snap-start',
                }
              : {
                  'data-card': true,
                  className:
                    'group shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)] xl:w-[calc((100%-64px)/5)] snap-start cursor-default',
                };
            return (
              <WeaveTag
                key={w.id}
                {...(weaveProps as { href: string; className: string; 'data-card': true })}
              >
                {/* Mihrab-arch tile. Pothys "Explore Other Collections"
                    pattern — portrait ratio inside a rounded-arch window,
                    wrapped in a dark wood-toned frame so each saree sits
                    inside what reads as a carved wooden doorway. */}
                <div
                  className="relative aspect-[2/3] overflow-hidden no-pattern transition-transform duration-500 group-hover:-translate-y-1"
                  style={{
                    background:
                      'linear-gradient(145deg, #4a2d1e 0%, #2a1610 50%, #3d2317 100%)',
                    padding: '10px',
                    borderRadius: '50% 50% 0 0 / 38% 38% 0 0',
                    boxShadow:
                      'inset 0 -2px 10px rgba(0,0,0,0.35), 0 8px 20px rgba(42,22,16,0.25)',
                  }}
                >
                  <div
                    className="relative w-full h-full overflow-hidden bg-ivory"
                    style={{ borderRadius: '50% 50% 0 0 / 38% 38% 0 0' }}
                  >
                    {w.image ? (
                      <Image
                        src={w.image}
                        alt={w.name}
                        fill
                        sizes="(max-width: 640px) 46vw, (max-width: 1024px) 32vw, (max-width: 1280px) 24vw, 20vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-maroon-deep via-maroon to-maroon-deep flex items-center justify-center p-4 transition-transform duration-500 group-hover:scale-105">
                        <span className="font-display text-ivory/95 text-lg md:text-xl text-center leading-tight">
                          {w.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-3">
                  <div className="text-base md:text-lg font-bold text-ink leading-tight">
                    {w.name}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-[0.7rem] text-ink/55">{w.place}</div>
                    <div className="text-[0.7rem] font-semibold text-ink/65">
                      {count} {count === 1 ? 'piece' : 'pieces'}
                    </div>
                  </div>
                </div>
              </WeaveTag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
