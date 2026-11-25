'use client';

import type { ServerCategory } from '@/lib/api';

/**
 * CategoryCatIntro — editorial header for a live backend category
 * (admin-managed), matching the visual treatment of CategoryWeaveIntro.
 * Pulls name / story from the ServerCategory row so the admin controls
 * both the headline and the body copy without a redeploy.
 *
 * Headline falls back to the plain category name when no story is set;
 * the body falls back to a generic line so the band never collapses.
 */
export default function CategoryCatIntro({ category }: { category: ServerCategory }) {
  const story = (category.story || '').trim();

  return (
    <section className="bg-ivory border-b border-gray-200">
      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-10 md:py-12 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/lotus.png"
          alt=""
          aria-hidden
          className="mx-auto mb-5 h-8 md:h-9 w-auto select-none"
          draggable={false}
        />
        <div className="text-[0.68rem] md:text-[0.72rem] tracking-[0.35em] uppercase font-bold text-gold-deep mb-4">
          The House Collection
        </div>

        <div
          role="heading"
          aria-level={1}
          className="font-sans text-xl md:text-2xl lg:text-[1.6rem] font-extrabold text-ink leading-tight tracking-tight"
        >
          {category.name}
        </div>

        <p className="mt-3 text-xs md:text-sm text-ink/75 leading-relaxed max-w-[900px] mx-auto">
          {story || (
            <>
              A curated edit from the House of GnanRudh — {category.name.toLowerCase()}{' '}
              drawn from our atelier&apos;s finest looms.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
