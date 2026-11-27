'use client';

import Link from 'next/link';
import { useState } from 'react';
import clsx from 'clsx';
import type { ServerCategory, ServerPriceRange, ServerOccasion } from '@/lib/api';

/**
 * ShopAllMegaMenu — Kalki-style mega menu that opens when the user
 * hovers "Shop All" in the nav. Left sidebar lists group labels (hover
 * to switch); right side shows a grid of image tiles for the active
 * group. Each tile deep-links to the shop with the right filter.
 *
 * Positioning / visibility are owned by the parent (Nav) — this
 * component just paints the panel and handles group switching.
 */

export type Tile = { label: string; href: string; image?: string };
export type Group = { id: string; label: string; tiles: Tile[] };

export const GROUPS: Group[] = [
  {
    id: 'weaves',
    label: 'Shop by Weave',
    tiles: [
      { label: 'Kanjeevaram', href: '/shop?weave=Kanjivaram', image: '/Byweaves/kanjeevaram.webp' },
      { label: 'Banarasi', href: '/shop?weave=Banarasi', image: '/Byweaves/banarasi.webp' },
      { label: 'Mysore Silk', href: '/shop?weave=Mysore+Silk', image: '/Byweaves/Mysore silk.webp' },
      { label: 'Mangalagiri', href: '/shop?weave=Mangalagiri', image: '/Byweaves/mangalagiri.webp' },
      { label: 'Pochampally', href: '/shop?weave=Pochampally', image: '/Byweaves/Pochampally.webp' },
      { label: 'Gadwal', href: '/shop?weave=Gadwal', image: '/Byweaves/Gadwal.webp' },
      { label: 'Patola', href: '/shop?weave=Patola', image: '/Byweaves/Patola.webp' },
      { label: 'Fancy Sarees', href: '/shop?weave=Fancy+Sarees', image: '/Byweaves/fancy-saree.webp' },
      { label: 'Mixed Pattu', href: '/shop?weave=Mixed+Pattu+Sarees', image: '/Byweaves/Mixed-pattu.webp' },
    ],
  },
  {
    id: 'occasions',
    label: 'Shop by Occasion',
    tiles: [
      { label: 'Bridal', href: '/shop?tier=bridal', image: '/bestsellers/Mayura kanjee.webp' },
      { label: 'Festive', href: '/shop?tier=festive', image: '/bestsellers/Rasleela patola2.webp' },
      { label: 'Everyday', href: '/shop?tier=everyday', image: '/Byweaves/mangalagiri.webp' },
    ],
  },
  {
    id: 'price',
    label: 'Shop by Price',
    // Price buckets use ?minPrice / ?maxPrice query params. If the shop
    // view doesn't yet filter on these, the links still land on /shop
    // with the params preserved for whenever the filter wiring lands.
    tiles: [
      { label: 'Under ₹10,000', href: '/shop?maxPrice=10000', image: '/Byweaves/mangalagiri.webp' },
      { label: '₹10,000 – ₹25,000', href: '/shop?minPrice=10000&maxPrice=25000', image: '/Byweaves/Mysore silk.webp' },
      { label: '₹25,000 – ₹50,000', href: '/shop?minPrice=25000&maxPrice=50000', image: '/Byweaves/kanjeevaram.webp' },
      { label: '₹50,000 – ₹1,00,000', href: '/shop?minPrice=50000&maxPrice=100000', image: '/bestsellers/Mayura kanjee.webp' },
      { label: 'Above ₹1,00,000', href: '/shop?minPrice=100000', image: '/bestsellers/Rasleela patola2.webp' },
    ],
  },
  {
    id: 'collections',
    label: 'Collections',
    // No hardcoded images — tiles render as skeletons until a real image
    // source is wired (e.g. live products carrying the matching badge).
    tiles: [
      { label: 'New Arrivals', href: '/shop?sort=new' },
      { label: 'Best Sellers', href: '/shop?sort=bestseller' },
      { label: 'On Sale', href: '/shop?sale=1' },
    ],
  },
];

// Merge live admin data into the static group set:
// - `weaves` tiles become `/shop?cat=<id>` links from the Categories collection.
// - `price` tiles become `/shop?minPrice=&maxPrice=` links from the PriceRanges
//   collection, using the admin's uploaded tile image when present.
// - `occasions` tiles become `/shop?tier=<id>` links from the top-level
//   Occasions (parent=null) with the admin's tile image.
// Any stream can be empty (fresh DB or fetch still in flight) — the static
// tiles for that group are kept so the menu never flashes empty.
export function buildShopAllGroups(
  categories: ServerCategory[],
  priceRanges: ServerPriceRange[] = [],
  occasions: ServerOccasion[] = [],
): Group[] {
  const fallbackPriceImages = GROUPS.find((g) => g.id === 'price')!.tiles.map((t) => t.image);
  // Occasions: no fallback image. Admin-uploaded `o.image` only — tiles
  // without an upload render as a pulsing skeleton in the mega menu so
  // it's clear those are waiting on content rather than borrowing a
  // hardcoded photo.
  const occasionTiles: Tile[] = occasions
    .filter((o) => !o.parent)
    .map((o) => ({
      label: o.name,
      href: `/shop?tier=${encodeURIComponent(String(o._id || o.name).toLowerCase())}`,
      image: o.image && o.image.trim() ? o.image : undefined,
    }));
  const priceTiles: Tile[] = priceRanges.map((r, i) => {
    const min = Math.round(r.min || 0);
    const max = r.max == null ? null : Math.round(r.max);
    const href =
      max == null ? `/shop?minPrice=${min}`
      : !min ? `/shop?maxPrice=${max}`
      : `/shop?minPrice=${min}&maxPrice=${max}`;
    return {
      label: (r.label || r.title || '').trim() || `Band ${i + 1}`,
      href,
      image: (r.image && r.image.trim()) || fallbackPriceImages[i % fallbackPriceImages.length],
    };
  });
  return GROUPS
    // Drop "Shop by Occasion" entirely when the backend has no top-level
    // occasions. The static fallback tiles (Bridal / Festive / Everyday)
    // are kept for every OTHER call site (those still read `GROUPS`
    // directly), but the live mega-menu respects the admin's actual
    // taxonomy so an unused section doesn't hang around.
    .filter((g) => g.id !== 'occasions' || occasionTiles.length > 0)
    .map((g) => {
      if (g.id === 'weaves' && categories.length) {
        // Cap the mega-menu to the first 5 admin categories so the panel
        // doesn't balloon when more are added. The Shop page still lists
        // the full set in its filter rail; this is just the entry surface.
        return {
          ...g,
          tiles: categories.slice(0, 5).map((c) => ({
            label: c.name,
            href: `/shop?cat=${encodeURIComponent(c._id)}`,
            image: c.image || undefined,
          })),
        };
      }
      if (g.id === 'price' && priceTiles.length) {
        return { ...g, tiles: priceTiles };
      }
      if (g.id === 'occasions' && occasionTiles.length) {
        return { ...g, tiles: occasionTiles };
      }
      return g;
    });
}

export default function ShopAllMegaMenu({
  open,
  onClose,
  groups = GROUPS,
}: {
  open: boolean;
  onClose: () => void;
  groups?: Group[];
}) {
  const [activeId, setActiveId] = useState(groups[0].id);
  const active = groups.find((g) => g.id === activeId) ?? groups[0];

  return (
    <div
      className={clsx(
        'absolute left-0 right-0 top-full bg-ivory border-t border-ink/10 shadow-[0_12px_28px_-12px_rgba(77,0,21,0.18)] transition-all duration-200 origin-top',
        open
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 -translate-y-2 pointer-events-none',
      )}
      aria-hidden={!open}
      data-lenis-prevent
    >
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10 py-6 flex gap-8">
        {/* Left sidebar — hover any row to change the right grid.
            `self-start` keeps it pinned to the top while the right grid
            scrolls underneath. */}
        <aside className="w-72 shrink-0 bg-bone -my-6 -ml-6 lg:-ml-10 py-8 pl-11 lg:pl-[60px] pr-5">
          <nav className="flex flex-col">
            {groups.map((g) => {
              const isActive = g.id === activeId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onMouseEnter={() => setActiveId(g.id)}
                  onFocus={() => setActiveId(g.id)}
                  className={clsx(
                    // Transition `color` only — if we transition bg-color
                    // too, pointer transits between rows briefly paint
                    // both the outgoing and incoming cream fills, giving
                    // a doubled-pill flicker.
                    'relative text-left whitespace-nowrap py-2.5 -ml-3 pl-3 pr-3 text-[0.85rem] tracking-[0.1em] uppercase font-bold transition-[color] duration-150',
                    // Active row: cream fill that bleeds past the sidebar's
                    // right padding AND across the flex gap so it visually
                    // attaches to the right-side image grid (also ivory).
                    isActive
                      ? 'bg-ivory text-gold-deep rounded-l-sm -mr-[52px]'
                      : 'text-ink hover:text-gold-deep',
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right grid — image tiles for the active group. Capped at
            ~55vh so the panel never dominates the viewport; overflows
            scroll inside the grid while the sidebar stays in view. */}
        <div className="flex-1 max-h-[55vh] overflow-y-auto overscroll-contain pr-2 -mr-2 grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
          {active.tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              onClick={onClose}
              className="group"
            >
              <div
                className={clsx(
                  'relative aspect-square overflow-hidden img-fallback',
                  // Occasions + Collections groups: no fallback image.
                  // Tiles without a real photo render as a pulsing skeleton
                  // so empty state reads as "waiting on content" rather
                  // than a blank tile.
                  t.image
                    ? 'bg-ivory'
                    : active.id === 'occasions' || active.id === 'collections'
                      ? 'bg-ink/5 animate-pulse'
                      : 'bg-ivory',
                )}
              >
                {t.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.image}
                    alt={t.label}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    draggable={false}
                    loading="lazy"
                  />
                )}
              </div>
              <p className="mt-2 text-[0.78rem] tracking-[0.1em] uppercase text-ink group-hover:text-maroon transition-colors text-center font-medium">
                {t.label}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
