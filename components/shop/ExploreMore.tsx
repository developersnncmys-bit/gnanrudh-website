'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLiveCategories } from '@/lib/catalog';

export default function ExploreMore() {
  // Pulled from the admin Categories list. Shows the first four visible
  // categories so the strip never outgrows the four-across grid. Falls to
  // a loading skeleton on first paint and hides entirely once the fetch
  // resolves to an empty list — no static fallback, in line with the rest
  // of the storefront.
  const { categories, loading } = useLiveCategories({ sareeOnly: false });
  const visible = categories.filter((c) => c.visible !== false).slice(0, 4);

  if (!loading && visible.length === 0) return null;

  return (
    <section className="bg-white border-t border-gray-200">
      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-6 lg:py-8">
        <h2 className="text-base md:text-lg font-bold uppercase tracking-wider text-gray-900 mb-4">
          Explore More
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="aspect-[4/3] sm:aspect-[5/4] lg:aspect-[4/5] overflow-hidden bg-gray-100 animate-pulse"
                />
              ))
            : visible.map((c) => (
                <Link
                  key={c._id}
                  href={`/shop?cat=${encodeURIComponent(c._id)}`}
                  className="group relative block aspect-[4/3] sm:aspect-[5/4] lg:aspect-[4/5] overflow-hidden bg-gray-100"
                >
                  {c.image && (
                    <Image
                      src={c.image}
                      alt={c.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover object-[50%_18%] transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col px-4 pb-4 text-white">
                    <div className="text-sm lg:text-base font-bold mb-0.5">{c.name}</div>
                    {c.story && (
                      <div className="text-xs text-white/85 mb-2 line-clamp-1">{c.story}</div>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold tracking-wider uppercase">
                      Shop Now
                      <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
