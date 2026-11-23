'use client';

import Link from 'next/link';
import { useState } from 'react';
import { type SAREES } from '@/lib/sarees';

type Saree = (typeof SAREES)[number];

type TabId = 'details' | 'speciality' | 'tips' | 'shipping' | 'faqs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'details', label: 'Product Details' },
  { id: 'speciality', label: 'Product Speciality' },
  { id: 'tips', label: 'Style & Fit Tips' },
  { id: 'shipping', label: 'Shipping & Returns' },
  { id: 'faqs', label: 'FAQs' },
];

/**
 * ProductAccordion — replaced the stacked collapse pattern with a
 * horizontal tabs layout. One section is visible at a time, a gold
 * underline marks the active tab, and content fades into place
 * beneath. Reads cleaner than five collapsed rows and matches the
 * luxury ecommerce convention used by Kalki / Taneira / Nalli.
 */
export default function ProductAccordion({ saree }: { saree: Saree }) {
  const [active, setActive] = useState<TabId>('details');

  return (
    <section>
      {/* Tab bar — centred editorial row. Italiana labels, hairline rule
          below with a small diamond indicator snapping to the active tab. */}
      <div className="border-b border-ink/10">
        <div
          role="tablist"
          aria-label="Product information"
          className="flex justify-center gap-8 md:gap-14 overflow-x-auto no-scrollbar px-2"
        >
          {TABS.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.id}`}
                id={`tab-${t.id}`}
                onClick={() => setActive(t.id)}
                className={`relative shrink-0 pt-5 pb-6 md:pt-6 md:pb-7 font-display font-bold text-[1rem] md:text-[1.15rem] tracking-tight whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-maroon-deep'
                    : 'text-ink/50 hover:text-ink'
                }`}
              >
                {t.label}
                {/* Diamond + hairline underline for the active tab */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 bottom-2 flex items-center gap-1.5"
                  >
                    <span className="h-px w-5 bg-gold/70" />
                    <span className="w-1 h-1 rotate-45 bg-gold-deep" />
                    <span className="h-px w-5 bg-gold/70" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel area — only the active panel is rendered. Keyed on the
          active id so entering a new panel resets the subtle fade-in. */}
      <div
        key={active}
        id={`panel-${active}`}
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className="py-10 md:py-14 animate-[fadeIn_240ms_ease-out]"
      >
        {active === 'details' && <ProductDetailsTable saree={saree} />}
        {active === 'speciality' && (
          <div className="max-w-3xl mx-auto text-center">
            {saree.speciality ? (
              <p className="font-display font-bold italic text-sm md:text-base text-ink leading-[1.7] whitespace-pre-line">
                {saree.speciality}
              </p>
            ) : (
              <EmptyTab message="Speciality notes are being added for this saree." />
            )}
          </div>
        )}
        {active === 'tips' && (
          (saree.styleTip || saree.fitTip) ? (
            <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12">
              {saree.styleTip && <PanelNote title="Style" body={saree.styleTip} />}
              {saree.fitTip && <PanelNote title="Fit" body={saree.fitTip} />}
            </div>
          ) : (
            <EmptyTab message="Style & fit tips are being added for this saree." />
          )
        )}
        {active === 'shipping' && (
          <div className="max-w-3xl mx-auto text-center space-y-5">
            {saree.shippingNote ? (
              <p className="text-[0.95rem] md:text-base text-ink/75 leading-[1.95] whitespace-pre-line">
                {saree.shippingNote}
              </p>
            ) : (
              <EmptyTab message="Shipping & returns note is being added for this saree." />
            )}
            {/* The policy link is navigation, not copy — always rendered. */}
            <Link
              href="/returns"
              className="inline-flex items-center gap-2 pt-2 font-display font-bold text-[1.05rem] text-maroon-deep hover:text-maroon transition-colors"
            >
              Read full return policy
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
        {active === 'faqs' && (
          <div className="max-w-3xl mx-auto">
            {saree.faqs && saree.faqs.length > 0 ? (
              saree.faqs.map((faq, i) => (
                <FaqRow key={`faq-${i}`} q={faq.q} a={faq.a} />
              ))
            ) : (
              <EmptyTab message="FAQs are being added for this saree." />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Shown on any PDP tab where the admin hasn't authored content yet —
// quiet italic one-liner instead of silently rendering shipped seed copy.
function EmptyTab({ message }: { message: string }) {
  return (
    <div className="max-w-xl mx-auto text-center py-6">
      <p className="text-sm text-ink/55 italic leading-relaxed">{message}</p>
    </div>
  );
}

type DetailRow = { label: string; value: string; swatch?: string };
type DetailSection = {
  title: string;
  icon: 'tag' | 'thread' | 'box';
  rows: DetailRow[];
};

function ProductDetailsTable({ saree }: { saree: Saree }) {
  const swatchHex = saree.palette[0];
  // Build rows strictly from admin-authored data. No derivations, no
  // seed fallbacks — empty values drop the row, sections with no rows
  // are hidden entirely so the PDP never shows invented copy.
  const row = (label: string, value: string | undefined, swatch?: string): DetailRow | null => {
    const v = (value || '').trim();
    if (!v) return null;
    return swatch ? { label, value: v, swatch } : { label, value: v };
  };
  const allSections: DetailSection[] = [
    {
      title: 'Identity',
      icon: 'tag',
      rows: [
        row('Style No', saree.details.styleNo),
        row('Design No', saree.details.designNo),
        row('Color', saree.details.colourLabel, swatchHex),
        // Category auto-derived from the product's category pick in the
        // admin (same source as Work). One admin field, two PDP labels.
        row('Category', saree.weave),
      ].filter((r): r is DetailRow => r !== null),
    },
    {
      title: 'Craft & Material',
      icon: 'thread',
      rows: [
        row('Work', saree.weave),
        row('Zari', saree.details.zari),
        row('Length', saree.details.length),
        row('Blouse', saree.details.blouse),
        row('Weight', saree.details.weight),
      ].filter((r): r is DetailRow => r !== null),
    },
    {
      title: 'Pack & Provenance',
      icon: 'box',
      rows: [
        row('Pack Contains', saree.details.packContains),
        row('Manufactured', saree.details.manufacturedBy),
      ].filter((r): r is DetailRow => r !== null),
    },
  ];
  const sections = allSections.filter((section) => section.rows.length > 0);

  if (sections.length === 0) {
    return <EmptyTab message="Product details are being added for this saree." />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-12 lg:gap-y-0 lg:divide-x divide-ink/10">
      {sections.map((section, idx) => (
        <section
          key={section.title}
          className={`px-0 ${idx > 0 ? 'lg:px-10 xl:px-14' : 'lg:pr-10 xl:pr-14'}`}
        >
          {/* Section mark — icon medallion + Italiana title, hairline rule
              with gold diamond beneath. Reads as a quiet editorial header. */}
          <header className="flex flex-col items-start">
            <span className="w-11 h-11 rounded-full bg-white ring-1 ring-gold-deep/50 flex items-center justify-center text-maroon-deep shadow-[0_1px_2px_rgba(77,0,21,0.05)]">
              <DetailIcon name={section.icon} />
            </span>
            <h3 className="mt-4 font-display font-bold text-2xl md:text-[1.7rem] text-ink leading-none">
              {section.title}
            </h3>
            <div className="mt-3 flex items-center gap-2" aria-hidden>
              <span className="h-px w-8 bg-gold/70" />
              <span className="w-1 h-1 rotate-45 bg-gold-deep" />
              <span className="h-px w-16 bg-gold/40" />
            </div>
          </header>

          {/* Spec list — clean label/value pairs, no boxes */}
          <dl className="mt-6 md:mt-7 space-y-5">
            {section.rows.map((r) => (
              <div key={r.label}>
                <dt className="text-[0.62rem] md:text-[0.66rem] font-bold tracking-[0.28em] uppercase text-ink/45">
                  {r.label}
                </dt>
                <dd className="mt-1.5 flex items-center gap-2 text-[0.95rem] md:text-base text-ink leading-snug">
                  {r.swatch && (
                    <span
                      aria-hidden
                      className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-ink/15 shrink-0"
                      style={{ backgroundColor: r.swatch }}
                    />
                  )}
                  <span>{r.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function DetailIcon({ name }: { name: 'tag' | 'thread' | 'box' }) {
  const c = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'tag':
      return (
        <svg {...c}>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8Z" />
          <circle cx="8" cy="8" r="1.5" />
        </svg>
      );
    case 'thread':
      return (
        <svg {...c}>
          <path d="M4 20c4-8 12-8 16 0" />
          <path d="M4 14c4-8 12-8 16 0" />
          <circle cx="12" cy="4" r="1.5" />
        </svg>
      );
    case 'box':
      return (
        <svg {...c}>
          <path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z" />
          <path d="M3 7.5 12 12l9-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
  }
}

function PanelNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[0.62rem] md:text-[0.66rem] font-bold tracking-[0.28em] uppercase text-gold-deep mb-2">
        {title}
      </div>
      <p className="text-[0.95rem] md:text-base text-ink/75 leading-[1.95]">
        {body}
      </p>
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink/10 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-display font-bold text-base md:text-lg text-ink group-hover:text-maroon-deep transition-colors">
          {q}
        </span>
        <span
          className={`text-2xl text-gold-deep transition-transform shrink-0 ${
            open ? 'rotate-45' : ''
          }`}
          aria-hidden
        >
          +
        </span>
      </button>
      {open && (
        <p className="pb-5 pr-8 text-[0.92rem] md:text-[0.95rem] text-ink/75 leading-[1.9]">
          {a}
        </p>
      )}
    </div>
  );
}
