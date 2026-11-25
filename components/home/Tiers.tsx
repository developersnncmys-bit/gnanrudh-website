'use client';

import Image from 'next/image';
import Link from 'next/link';
import SectionHeader from '@/components/home/SectionHeader';
import WishlistButton from '@/components/shop/WishlistButton';
import ViewSimilarButton from '@/components/shop/ViewSimilarButton';
import { formatINR, TIERS } from '@/lib/sarees';
import { useLiveSarees } from '@/lib/catalog';
import { navHref } from '@/lib/soft-launch';

// Shows the first four admin products tagged with the "Featured" badge.
// Admins control the section by ticking Featured on each product in the
// admin drawer; no hardcoded id list so the section stays in sync.
export default function Tiers() {
  const { sarees: liveSarees, loading: sareesLoading } = useLiveSarees();
  const items = liveSarees.filter((s) => s.badges.includes('featured')).slice(0, 4);
  const showSkeleton = sareesLoading || items.length === 0;

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="max-w-[1720px] mx-auto px-6 lg:px-10">
        <SectionHeader
          title="Featured Products"
          description="A curated edit of our most-loved weaves — bridal heirlooms, festive silks and everyday drapes, hand-picked for every occasion in a woman's wardrobe."
          link={{ href: '/shop?sort=new', label: 'View All' }}
          showDividers={false}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {showSkeleton
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={`tier-skel-${i}`} className="bg-white rounded-sm overflow-hidden" aria-hidden>
                  <div className="relative aspect-[4/5] overflow-hidden bg-ink/5 animate-pulse" />
                  <div className="p-3 md:p-3.5 space-y-2">
                    <div className="h-3 w-1/3 bg-ink/5 rounded-sm animate-pulse" />
                    <div className="h-5 w-3/4 bg-ink/5 rounded-sm animate-pulse" />
                    <div className="h-5 w-1/2 bg-ink/5 rounded-sm animate-pulse" />
                  </div>
                </div>
              ))
            : items.map((saree) => {
            const tier = TIERS[saree.tier];
            const discount =
              saree.mrp > saree.price
                ? Math.round(((saree.mrp - saree.price) / saree.mrp) * 100)
                : 0;
            const productHref = navHref(`/shop/${saree.id}`);
            const CardTag = productHref ? Link : 'span';
            const cardProps = productHref
              ? { href: productHref, className: 'group block bg-white rounded-sm overflow-hidden' }
              : { className: 'group block bg-white rounded-sm overflow-hidden cursor-default' };
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
                </div>
                <div className="p-3 md:p-3.5">
                  <div className="text-xs text-ink/55 font-medium mb-1">
                    {saree.weave}
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-ink leading-snug line-clamp-1 mb-2">
                    {saree.name}
                  </h3>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-lg md:text-xl font-bold text-ink">
                        {formatINR(saree.price)}
                      </span>
                      {saree.mrp > saree.price && (
                        <span className="text-sm text-ink/45 line-through">
                          {formatINR(saree.mrp)}
                        </span>
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
      </div>
    </section>
  );
}
