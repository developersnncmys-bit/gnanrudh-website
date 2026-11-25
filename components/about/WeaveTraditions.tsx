'use client';

import Image from 'next/image';
import Link from 'next/link';
import SectionHeader from '@/components/home/SectionHeader';
import { useLiveCategories } from '@/lib/catalog';
import { navHref } from '@/lib/soft-launch';

// Client-side Six Weaving Traditions section. Pulls the live categories the
// admin has flagged as `saree: true` and renders at most six — matching the
// "Six Weaving Traditions" header copy. Falls back to the static list the
// caller provides when the backend is unreachable or still loading so the
// about page is never empty on first paint / in offline dev.

export type WeaveFallback = {
  name: string;
  place: string;
  era: string;
  image: string;
  filter: string; // ?weave= slug used across the site
};

type Row = {
  key: string;
  name: string;
  place: string;
  era: string;
  image: string;
  href: string | null;
};

export default function WeaveTraditions({
  fallback,
}: {
  fallback: WeaveFallback[];
}) {
  const { categories, loading } = useLiveCategories({ sareeOnly: true });

  const fallbackRows: Row[] = fallback.slice(0, 6).map((w) => ({
    key: `fb-${w.name}`,
    name: w.name,
    place: w.place,
    era: w.era,
    image: w.image,
    href: navHref(`/shop?weave=${w.filter}`),
  }));

  // Prefer visible, admin-ordered saree categories. If the backend gave us
  // nothing (loading, or fetch failed), paint the fallback so this section
  // never flashes empty. Hard cap at six to keep the headline accurate.
  const liveRows: Row[] = categories
    .filter((c) => c.visible !== false)
    .slice(0, 6)
    .map((c, i) => ({
      key: c._id,
      name: c.name,
      // The ServerCategory shape doesn't carry a region string, so we fill
      // from the fallback at the same ordinal when available, then fall back
      // to the first weave listed on the category.
      place: fallback[i]?.place || (c.weaves?.[0] ?? ''),
      era: fallback[i]?.era || '',
      image: c.image || fallback[i]?.image || '',
      href: navHref(`/shop?cat=${encodeURIComponent(c._id)}`),
    }));

  const rows: Row[] = liveRows.length > 0 ? liveRows : fallbackRows;
  const showSkeleton = loading && rows === fallbackRows && rows.length === 0;

  return (
    <section className="bg-ivory py-12 md:py-16">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <SectionHeader
          title="Six Weaving Traditions"
          description="Each tradition has its own loom, its own thread count, its own grammar. We work with master families in every one of the regions below — plus the Jamdani weavers of Dhaka."
          showDividers={false}
        />

        <ol className="max-w-[900px] mx-auto divide-y divide-maroon/10 border-y border-maroon/10">
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={`skel-${i}`}
                  className="flex items-center gap-5 md:gap-7 py-5 md:py-6"
                >
                  <div className="w-10 md:w-16 h-8 md:h-10 bg-bone animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 md:h-6 w-40 bg-bone animate-pulse" />
                    <div className="h-3 w-28 bg-bone/80 animate-pulse" />
                    <div className="h-3 w-20 bg-bone/70 animate-pulse" />
                  </div>
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-bone animate-pulse" />
                </li>
              ))
            : rows.map((r, i) => {
                const inner = (
                  <>
                    <div className="font-display text-2xl md:text-4xl font-semibold text-maroon/80 tabular-nums leading-none shrink-0 w-10 md:w-16">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg md:text-2xl font-semibold text-ink leading-tight">
                        {r.name}
                      </div>
                      {r.place && (
                        <div className="mt-1 text-xs md:text-sm text-ink/65">
                          {r.place}
                        </div>
                      )}
                      {r.era && (
                        <div className="mt-0.5 text-[0.7rem] md:text-xs italic text-ink/50">
                          {r.era}
                        </div>
                      )}
                    </div>
                    <div className="relative shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-full overflow-hidden bg-bone ring-1 ring-maroon/10">
                      {r.image && (
                        <Image
                          src={r.image}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 56px, 80px"
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      )}
                    </div>
                  </>
                );
                const rowCls = 'group flex items-center gap-5 md:gap-7 py-5 md:py-6';
                return r.href ? (
                  <li key={r.key}>
                    <Link
                      href={r.href}
                      className={`${rowCls} hover:bg-white/60 -mx-4 px-4 transition-colors`}
                    >
                      {inner}
                    </Link>
                  </li>
                ) : (
                  <li key={r.key} className={`${rowCls} cursor-default`}>
                    {inner}
                  </li>
                );
              })}
        </ol>
      </div>
    </section>
  );
}
