'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveOccasions } from '@/lib/catalog';

type Tile = {
  href: string;
  title: string;
  caption: string;
  image: string;
  badge?: string;
};

/**
 * Shop by Category — editorial split-card layout. Each tile is a
 * portrait image on top with a clean white info area below (title,
 * caption, and an "Explore →" link). Replaces the earlier all-image
 * tile with a dark overlay, which fought the site's cream editorial
 * tone.
 *
 * Tiles are driven by the admin's Occasions collection — one tile per
 * top-level occasion, showing its first sub-occasion (ordered by
 * `order` then `name`). Admins control everything here through the
 * Occasions screen in the admin panel; no hardcoded list.
 */
export default function CategoryTiles() {
  const { occasions, loading } = useLiveOccasions();

  const tiles = useMemo<Tile[]>(() => {
    const parents = occasions.filter((o) => !o.parent)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    const result: Tile[] = [];
    for (const parent of parents) {
      const subs = occasions
        .filter((o) => o.parent && String(o.parent) === String(parent._id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
      const firstSub = subs[0];
      if (!firstSub) continue; // parent with no sub-occasions is skipped
      const parentSlug = String(parent._id || parent.name).toLowerCase();
      const subSlug = String(firstSub._id || firstSub.name).toLowerCase();
      result.push({
        href: `/shop?tier=${encodeURIComponent(parentSlug)}&occasion=${encodeURIComponent(subSlug)}`,
        title: firstSub.name,
        caption: `From the ${parent.name} edit — curated by the house.`,
        image: firstSub.image || '',
      });
      if (result.length === 3) break;
    }
    return result;
  }, [occasions]);

  const showSkeleton = loading || tiles.length === 0;

  return (
    <section className="bg-white border-b border-gray-200">
      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-10 lg:py-14">
        {/* Section header — centred eyebrow + display title + gold rule */}
        <div className="text-center mb-8 lg:mb-10">
          <div className="text-[0.65rem] md:text-[0.72rem] tracking-[0.35em] uppercase font-bold text-maroon mb-3">
            Collections
          </div>
          <h2 className="font-display text-2xl md:text-3xl lg:text-[2rem] font-semibold text-ink leading-tight">
            Shop by Category
          </h2>
          <span aria-hidden className="block mx-auto h-px w-12 bg-gold/70 mt-5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {showSkeleton
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={`cat-tile-skel-${i}`} className="bg-white rounded-sm overflow-hidden shadow-[0_1px_3px_rgba(77,0,21,0.06)]" aria-hidden>
                  <div className="relative aspect-[4/5] overflow-hidden bg-ink/5 animate-pulse" />
                  <div className="px-5 py-6 md:px-6 md:py-7 text-center space-y-3">
                    <div className="h-5 w-1/2 bg-ink/5 rounded-sm animate-pulse mx-auto" />
                    <div className="h-3 w-3/4 bg-ink/5 rounded-sm animate-pulse mx-auto" />
                  </div>
                </div>
              ))
            : tiles.map((tile) => (
                <Link
                  key={tile.href + tile.title}
                  href={tile.href}
                  className="group block bg-white rounded-sm overflow-hidden shadow-[0_1px_3px_rgba(77,0,21,0.06)] hover:shadow-[0_10px_30px_rgba(77,0,21,0.12)] transition-shadow duration-300"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                    {tile.image ? (
                      <Image
                        src={tile.image}
                        alt={tile.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : null}

                    {tile.badge && (
                      <div
                        className="absolute top-3 left-3 text-ink px-3 py-1 text-[0.6rem] font-bold tracking-[0.2em] uppercase rounded-sm"
                        style={{
                          backgroundImage:
                            'linear-gradient(135deg, #C8923F 0%, #F2C99E 50%, #C8923F 100%)',
                          boxShadow:
                            '0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
                        }}
                      >
                        {tile.badge}
                      </div>
                    )}
                  </div>

                  <div className="px-5 py-6 md:px-6 md:py-7 text-center">
                    <h3 className="font-display text-lg md:text-xl lg:text-[1.35rem] font-semibold text-ink leading-tight">
                      {tile.title}
                    </h3>
                    <p className="mt-2 text-sm text-ink/60 leading-relaxed line-clamp-2">
                      {tile.caption}
                    </p>
                    <span
                      aria-hidden
                      className="block mx-auto h-px w-8 bg-gold/70 my-4"
                    />
                    <span className="inline-flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.25em] uppercase text-maroon group-hover:text-maroon-deep transition-colors">
                      Explore
                      <span
                        aria-hidden
                        className="inline-block transition-transform duration-300 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
