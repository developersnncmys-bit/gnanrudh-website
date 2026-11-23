'use client';

import { TIERS, STANDARD_COLORWAYS } from '@/lib/sarees';
import type { Tier, Weave } from '@/lib/sarees';
import { useLiveCategories } from '@/lib/catalog';
import { ColorList } from './FilterRailPrimitives';

const PRICE_BRACKETS: { id: string; label: string; min: number; max: number }[] = [
  { id: 'under-5k', label: 'Under ₹5,000', min: 0, max: 5000 },
  { id: '5-15k', label: '₹5,000 – ₹15,000', min: 5000, max: 15000 },
  { id: '15-30k', label: '₹15,000 – ₹30,000', min: 15000, max: 30000 },
  { id: '30-60k', label: '₹30,000 – ₹60,000', min: 30000, max: 60000 },
  { id: 'above-60k', label: 'Above ₹60,000', min: 60000, max: Infinity },
];

export type FilterState = {
  tiers: Tier[];
  weaves: Weave[];
  // Admin-managed categories (backend `Category._id`). Populated by the
  // "Shop by Category" filter section; the navbar's `?cat=<id>` deep
  // links feed this too. Lives alongside `weaves` so hard-coded weave
  // deep-link URLs stay intact.
  categories: string[];
  bracket: string | null;
  sale: boolean;
  colors: string[]; // STANDARD_COLORWAYS ids
};

export const EMPTY_FILTERS: FilterState = {
  tiers: [], weaves: [], categories: [], bracket: null, sale: false, colors: [],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-gray-200">
      <div className="text-sm font-bold text-gray-900 mb-2.5 uppercase tracking-wide">
        {title}
      </div>
      {children}
    </div>
  );
}

function Check({
  label, checked, onChange, count,
}: { label: string; checked: boolean; onChange: () => void; count?: number }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group py-1">
      <span className={`w-4 h-4 border flex items-center justify-center transition-colors shrink-0 ${
        checked ? 'border-gray-900 bg-gray-900' : 'border-gray-400 group-hover:border-gray-900'
      }`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white" aria-hidden>
            <path d="M2 6.5 5 9l5-6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className={`text-sm leading-tight flex-1 ${checked ? 'text-gray-900 font-medium' : 'text-gray-700 group-hover:text-gray-900'}`}>
        {label}
      </span>
      {typeof count === 'number' && (
        <span className="text-xs text-gray-500 tabular-nums">{count}</span>
      )}
    </label>
  );
}

function Radio({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group py-1">
      <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
        checked ? 'border-gray-900' : 'border-gray-400 group-hover:border-gray-900'
      }`}>
        {checked && <span className="w-2 h-2 rounded-full bg-gray-900" />}
      </span>
      <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
      <span className={`text-sm leading-tight flex-1 ${checked ? 'text-gray-900 font-medium' : 'text-gray-700 group-hover:text-gray-900'}`}>
        {label}
      </span>
    </label>
  );
}

export default function FilterRail({
  filters, counts, onChange, onClear,
}: {
  filters: FilterState;
  counts: {
    tier: Record<Tier, number>;
    category: Record<string, number>;
    color: Record<string, number>;
    sale: number;
  };
  onChange: (next: FilterState) => void;
  onClear: () => void;
}) {
  // Backend categories feed the "Shop by Category" section. Falls back
  // to an empty list when the fetch is in flight — the section just
  // renders nothing below its header until the response lands.
  const { categories: liveCategories } = useLiveCategories();

  const activeCount =
    filters.tiers.length + filters.weaves.length + filters.categories.length +
    (filters.bracket ? 1 : 0) + (filters.sale ? 1 : 0) +
    filters.colors.length;

  const toggleTier = (t: Tier) => onChange({
    ...filters,
    tiers: filters.tiers.includes(t) ? filters.tiers.filter((x) => x !== t) : [...filters.tiers, t],
  });
  const toggleCategory = (id: string) => onChange({
    ...filters,
    categories: filters.categories.includes(id)
      ? filters.categories.filter((x) => x !== id)
      : [...filters.categories, id],
  });
  const selectBracket = (id: string) => onChange({
    ...filters, bracket: filters.bracket === id ? null : id,
  });
  const toggleColor = (id: string) => onChange({
    ...filters,
    colors: filters.colors.includes(id)
      ? filters.colors.filter((x) => x !== id)
      : [...filters.colors, id],
  });

  return (
    <aside className="w-full lg:w-[240px] shrink-0">
      <div className="flex items-center justify-between pb-3 border-b-2 border-gray-900">
        <div className="text-base font-bold text-gray-900 uppercase tracking-wide">Filters</div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-maroon-deep hover:underline uppercase"
          >
            Clear ({activeCount})
          </button>
        )}
      </div>

      <Section title="Occasions">
        {(Object.keys(TIERS) as Tier[]).map((id) => {
          const t = TIERS[id];
          return (
            <Check
              key={id}
              label={t.sub}
              checked={filters.tiers.includes(id)}
              onChange={() => toggleTier(id)}
              count={counts.tier[id]}
            />
          );
        })}
      </Section>

      <Section title="Shop by Category">
        {liveCategories.map((c) => (
          <Check
            key={c._id}
            label={c.name}
            checked={filters.categories.includes(c._id)}
            onChange={() => toggleCategory(c._id)}
            count={counts.category[c._id] ?? 0}
          />
        ))}
      </Section>

      <Section title="Color">
        <ColorList
          colors={STANDARD_COLORWAYS}
          selectedIds={filters.colors}
          counts={counts.color}
          onToggle={toggleColor}
        />
        {filters.colors.length > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            {filters.colors
              .map((id) => STANDARD_COLORWAYS.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </Section>

      <Section title="Price">
        {PRICE_BRACKETS.map((b) => (
          <Radio
            key={b.id}
            label={b.label}
            checked={filters.bracket === b.id}
            onChange={() => selectBracket(b.id)}
          />
        ))}
      </Section>

      <Section title="Offers">
        <Check
          label="On sale"
          checked={filters.sale}
          onChange={() => onChange({ ...filters, sale: !filters.sale })}
          count={counts.sale}
        />
      </Section>
    </aside>
  );
}

export { PRICE_BRACKETS };
