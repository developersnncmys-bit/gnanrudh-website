'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SAREES, STANDARD_COLORWAYS, BADGE_LABEL, sareeMatchesColor } from '@/lib/sarees';
import type { BadgeKind } from '@/lib/sarees';
import { useLiveCategories, useLiveSarees } from '@/lib/catalog';
import ProductCard from './ProductCard';
import { Section, Check, RangeInput, PriceRow, ColorList } from './FilterRailPrimitives';
import CategoryCatIntro from './CategoryCatIntro';
import CategoryTrustBand from './CategoryTrustBand';
import CategoryStylingGuide from './CategoryStylingGuide';
import FilterDrawer from './FilterDrawer';
import FilterTriggerBar from './FilterTriggerBar';

/**
 * CategoryCatView — editorial landing page for a single admin-managed
 * category (`?cat=<_id>`). Visually mirrors CategoryWeaveView so the
 * whole catalogue reads as one family, but:
 *   - the headline + body come from the live ServerCategory row (the
 *     admin controls the copy, no redeploy needed)
 *   - the base dataset is pre-filtered to products whose `saree.region`
 *     matches the locked category id
 *   - URL writes preserve `cat=<id>` so the filter drawer stays here
 *     instead of bouncing to another view
 */

const AVAILABILITY_BADGES: BadgeKind[] = ['ready', 'fast'];

const PRICE_BRACKETS: { id: string; label: string; min: number; max: number }[] = [
  { id: 'under-5k',  label: 'Under ₹5,000',           min: 0,     max: 5000 },
  { id: '5-15k',     label: '₹5,000 – ₹15,000',       min: 5000,  max: 15000 },
  { id: '15-30k',    label: '₹15,000 – ₹30,000',      min: 15000, max: 30000 },
  { id: '30-60k',    label: '₹30,000 – ₹60,000',      min: 30000, max: 60000 },
  { id: 'above-60k', label: 'Above ₹60,000',          min: 60000, max: Infinity },
];

const DISCOUNT_BANDS: { id: string; label: string; min: number; max: number }[] = [
  { id: '10-20',  label: '10 – 20%',   min: 10,  max: 20 },
  { id: '20-30',  label: '20 – 30%',   min: 20,  max: 30 },
  { id: '30-40',  label: '30 – 40%',   min: 30,  max: 40 },
  { id: '40plus', label: '40% & Above', min: 40,  max: Infinity },
];

function discountPct(saree: (typeof SAREES)[number]): number {
  if (!saree.mrp) return 0;
  return Math.round(((saree.mrp - saree.price) / saree.mrp) * 100);
}

type Sort = 'curated' | 'price-asc' | 'price-desc';

const SORT_LABELS: Record<Sort, string> = {
  curated: 'Featured',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
};

export default function CategoryCatView({ catId }: { catId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve the live category row so the intro can read its name/story.
  // While the fetch is in flight the row is undefined — we render the
  // page shell + skeletons just like the weave view does.
  const { categories: liveCategories, loading: catLoading } = useLiveCategories();
  const category = liveCategories.find((c) => c._id === catId);

  const colors = useMemo<string[]>(() => {
    const csv = searchParams.get('color');
    if (!csv) return [];
    const valid = new Set(STANDARD_COLORWAYS.map((c) => c.id));
    return csv.split(',').filter((c) => valid.has(c));
  }, [searchParams]);
  const bracket = searchParams.get('bracket');
  const pmin = searchParams.get('pmin');
  const pmax = searchParams.get('pmax');
  const discounts = useMemo<string[]>(() => {
    const csv = searchParams.get('discount');
    if (!csv) return [];
    const valid = new Set(DISCOUNT_BANDS.map((d) => d.id));
    return csv.split(',').filter((d) => valid.has(d));
  }, [searchParams]);
  const availability = useMemo<BadgeKind[]>(() => {
    const csv = searchParams.get('avail');
    if (!csv) return [];
    const valid = new Set<string>(AVAILABILITY_BADGES);
    return csv.split(',').filter((v) => valid.has(v)) as BadgeKind[];
  }, [searchParams]);
  const rawSort = searchParams.get('order');
  const sort: Sort =
    rawSort && rawSort in SORT_LABELS ? (rawSort as Sort) : 'curated';

  // URL writer — always preserves `cat=<catId>` so the drawer stays on
  // this landing. Everything else is round-trippable.
  const updateUrl = (
    next: {
      colors?: string[];
      bracket?: string | null;
      order?: Sort;
      pmin?: string | null;
      pmax?: string | null;
      discounts?: string[];
      availability?: BadgeKind[];
    },
  ) => {
    const params = new URLSearchParams();
    params.set('cat', catId);
    const c = next.colors ?? colors;
    const b = next.bracket === undefined ? bracket : next.bracket;
    const o = next.order ?? sort;
    const pn = next.pmin === undefined ? pmin : next.pmin;
    const px = next.pmax === undefined ? pmax : next.pmax;
    const dd = next.discounts ?? discounts;
    const av = next.availability ?? availability;
    if (c.length) params.set('color', c.join(','));
    if (b) params.set('bracket', b);
    if (pn) params.set('pmin', pn);
    if (px) params.set('pmax', px);
    if (dd.length) params.set('discount', dd.join(','));
    if (av.length) params.set('avail', av.join(','));
    if (o && o !== 'curated') params.set('order', o);
    router.replace(`/shop?${params.toString()}`, { scroll: false });
  };

  const toggleColor = (id: string) =>
    updateUrl({ colors: colors.includes(id) ? colors.filter((x) => x !== id) : [...colors, id] });
  const selectBracket = (id: string) =>
    updateUrl({ bracket: bracket === id ? null : id });
  const toggleDiscount = (id: string) =>
    updateUrl({
      discounts: discounts.includes(id)
        ? discounts.filter((x) => x !== id)
        : [...discounts, id],
    });
  const toggleAvailability = (b: BadgeKind) =>
    updateUrl({
      availability: availability.includes(b)
        ? availability.filter((x) => x !== b)
        : [...availability, b],
    });
  const clearAll = () =>
    router.replace(`/shop?cat=${encodeURIComponent(catId)}`, { scroll: false });

  const [minInput, setMinInput] = useState(pmin ?? '');
  const [maxInput, setMaxInput] = useState(pmax ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setMinInput(pmin ?? ''); }, [pmin]);
  useEffect(() => { setMaxInput(pmax ?? ''); }, [pmax]);
  const commitRange = () => {
    const nextMin = minInput.trim() ? String(Math.max(0, Number(minInput) || 0)) : null;
    const nextMax = maxInput.trim() ? String(Math.max(0, Number(maxInput) || 0)) : null;
    if (nextMin === pmin && nextMax === pmax) return;
    updateUrl({ pmin: nextMin, pmax: nextMax });
  };

  // Live catalogue filtered to this category. `saree.region` stores the
  // backend category id — see lib/transforms.ts.
  const { sarees: liveSarees, loading: sareesLoading } = useLiveSarees();
  // Server returns products newest-first (created DESC) — don't reverse,
  // or the newest arrivals fall to the bottom of this category.
  const base = useMemo(
    () => liveSarees.filter((s) => s.region === catId),
    [liveSarees, catId],
  );

  const items = useMemo(() => {
    let list = base;
    if (colors.length) {
      list = list.filter((s) => colors.some((cid) => sareeMatchesColor(s, cid)));
    }
    if (bracket) {
      const pb = PRICE_BRACKETS.find((p) => p.id === bracket);
      if (pb) list = list.filter((s) => s.price >= pb.min && s.price < pb.max);
    }
    const nMin = pmin ? Number(pmin) : null;
    const nMax = pmax ? Number(pmax) : null;
    if (nMin !== null && !Number.isNaN(nMin)) list = list.filter((s) => s.price >= nMin);
    if (nMax !== null && !Number.isNaN(nMax)) list = list.filter((s) => s.price <= nMax);
    if (discounts.length) {
      const bands = DISCOUNT_BANDS.filter((d) => discounts.includes(d.id));
      if (bands.length) {
        list = list.filter((s) => {
          const d = discountPct(s);
          return bands.some((b) => d >= b.min && d < b.max);
        });
      }
    }
    if (availability.length) {
      list = list.filter((s) => availability.some((b) => s.badges.includes(b)));
    }
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [base, colors, bracket, pmin, pmax, discounts, availability, sort]);

  const colorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of STANDARD_COLORWAYS) {
      map[c.id] = base.filter((s) => sareeMatchesColor(s, c.id)).length;
    }
    return map;
  }, [base]);

  const discountCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of DISCOUNT_BANDS) map[b.id] = 0;
    for (const s of base) {
      const d = discountPct(s);
      if (d <= 0) continue;
      for (const b of DISCOUNT_BANDS) {
        if (d >= b.min && d < b.max) { map[b.id] += 1; break; }
      }
    }
    return map;
  }, [base]);

  const availabilityCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of AVAILABILITY_BADGES) map[b] = 0;
    for (const s of base) for (const b of s.badges) {
      if (b in map) map[b] += 1;
    }
    return map;
  }, [base]);

  const activeCount =
    colors.length +
    (bracket ? 1 : 0) +
    (pmin || pmax ? 1 : 0) +
    discounts.length +
    availability.length;

  // Resolved name powers the breadcrumb + intro. While the category
  // list is still loading we show the id placeholder briefly so the
  // layout doesn't shift when the real name lands.
  const displayName = category?.name ?? (catLoading ? '' : 'Collection');

  return (
    <div className="bg-white min-h-screen text-gray-900">
      {category ? (
        <CategoryCatIntro category={category} />
      ) : (
        // Skeleton band while the category fetch is in flight so the
        // page height doesn't jump when the real intro lands.
        <section className="bg-ivory border-b border-gray-200">
          <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-10 md:py-12 text-center">
            <div className="h-8 md:h-9 w-8 mx-auto mb-5 rounded-sm bg-ink/5 animate-pulse" />
            <div className="h-3 w-32 mx-auto mb-4 rounded-sm bg-ink/5 animate-pulse" />
            <div className="h-6 md:h-7 w-72 mx-auto rounded-sm bg-ink/5 animate-pulse" />
            <div className="h-4 w-[520px] max-w-[88%] mx-auto mt-4 rounded-sm bg-ink/5 animate-pulse" />
          </div>
        </section>
      )}

      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-8">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-3">
          <Link href="/" className="hover:text-gray-900">Home</Link>
          <span className="mx-1.5">/</span>
          <Link href="/shop" className="hover:text-gray-900">All Sarees</Link>
          <span className="mx-1.5">/</span>
          <span className="text-gray-900" aria-current="page">{displayName}</span>
        </nav>

        <section>
          <FilterTriggerBar
            productCount={items.length}
            activeCount={activeCount}
            onOpenFilter={() => setDrawerOpen(true)}
            sortValue={sort}
            sortOptions={(Object.keys(SORT_LABELS) as Sort[]).map((s) => ({
              value: s,
              label: SORT_LABELS[s],
            }))}
            onSortChange={(v) => updateUrl({ order: v as Sort })}
          />

          {sareesLoading ? (
            <div
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 pt-8"
              aria-busy="true"
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`cat-skel-${i}`} aria-hidden>
                  <div className="relative overflow-hidden bg-ink/5 aspect-[4/5] rounded-sm animate-pulse" />
                  <div className="h-4 mt-3 w-3/4 bg-ink/5 rounded-sm animate-pulse" />
                  <div className="h-4 mt-2 w-1/3 bg-ink/5 rounded-sm animate-pulse" />
                </div>
              ))}
            </div>
          ) : base.length === 0 ? (
            // The catalogue finished loading but no product in this category
            // has been published yet. Separate from the "filters cut it down
            // to zero" state so the shopper sees the right message and the
            // right call to action.
            <div className="py-16 md:py-20 px-6 text-center max-w-md mx-auto" role="status">
              <div
                aria-hidden
                className="mx-auto mb-5 w-14 h-14 rounded-full bg-ivory border border-gold-deep/30 flex items-center justify-center text-gold-deep"
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z" />
                  <path d="M3 7.5 12 12l9-4.5M12 12v9" />
                </svg>
              </div>
              <h2 className="font-display text-xl md:text-2xl font-semibold text-ink mb-2">
                {displayName
                  ? `No ${displayName} on the shelf yet`
                  : 'Nothing here yet'}
              </h2>
              <p className="text-sm text-ink/70 leading-relaxed mb-6">
                We&rsquo;re weaving this edit. In the meantime, browse the full
                House collection — there&rsquo;s something close waiting.
              </p>
              <Link
                href="/shop"
                className="inline-block bg-maroon-deep text-ivory px-6 py-2.5 text-xs font-semibold tracking-[0.15em] uppercase hover:bg-maroon transition-colors"
              >
                Browse all sarees
              </Link>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-600">
              No {displayName.toLowerCase()} match these filters.{' '}
              <button
                type="button"
                onClick={clearAll}
                className="text-maroon-deep font-semibold underline underline-offset-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 pt-8">
              {items.map((s, i) => (
                <ProductCard
                  key={s.id}
                  saree={s}
                  priority={i < 4}
                  hideBadges
                  hideDiscountOverlay
                  showBadgesBelowPrice
                  showViewSimilar
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productCount={items.length}
        activeCount={activeCount}
        onClearAll={clearAll}
      >
        <Section title="Price">
          {PRICE_BRACKETS.map((b) => (
            <PriceRow
              key={b.id}
              label={b.label}
              checked={bracket === b.id}
              onChange={() => selectBracket(b.id)}
            />
          ))}
          <div className="mt-3 flex items-center gap-2">
            <RangeInput
              prefix="₹"
              placeholder="From"
              value={minInput}
              onChange={setMinInput}
              onCommit={commitRange}
            />
            <span className="text-gray-400">–</span>
            <RangeInput
              placeholder="To"
              value={maxInput}
              onChange={setMaxInput}
              onCommit={commitRange}
            />
          </div>
        </Section>

        <Section title="Availability">
          <div className="flex flex-wrap gap-2 pt-1">
            {AVAILABILITY_BADGES.map((b) => {
              const active = availability.includes(b);
              const count = availabilityCounts[b] ?? 0;
              const disabled = count === 0 && !active;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleAvailability(b)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-wide rounded-full border transition-colors ${
                    active
                      ? 'bg-gray-900 text-white border-gray-900'
                      : disabled
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:border-gray-900 hover:text-gray-900'
                  }`}
                >
                  {BADGE_LABEL[b]}
                  <span className={`tabular-nums text-[0.68rem] font-normal ${active ? 'text-white/70' : 'text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Color">
          <ColorList
            colors={STANDARD_COLORWAYS}
            selectedIds={colors}
            counts={colorCounts}
            onToggle={toggleColor}
          />
        </Section>

        <Section title="Discount %" defaultOpen={false}>
          {DISCOUNT_BANDS.map((b) => (
            <Check
              key={b.id}
              label={b.label}
              checked={discounts.includes(b.id)}
              onChange={() => toggleDiscount(b.id)}
              count={discountCounts[b.id] ?? 0}
            />
          ))}
        </Section>
      </FilterDrawer>

      <CategoryTrustBand />

      {/* Admin-authored styling notes — mirrors the "Wearing your …"
          block on weave landings. The guide component hides itself when
          no tips are filled, so categories without authored copy skip
          this section entirely. */}
      {category ? (
        <CategoryStylingGuide
          title={(category.stylingTitle || '').trim() || `Wearing your ${category.name}`}
          intro={(category.stylingIntro || '').trim()}
          tips={category.stylingTips || []}
        />
      ) : null}
    </div>
  );
}
