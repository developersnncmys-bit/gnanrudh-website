'use client';

/**
 * CategoryStylingGuide — editorial styling notes rendered on a
 * category or weave landing page. Takes its title, intro and tip list
 * directly from the caller so the same block serves two sources:
 *   • CategoryWeaveView passes a template-interpolated set keyed on
 *     the current weave (Kanjeevaram, Banarasi, …)
 *   • CategoryCatView passes whatever the admin typed into the
 *     Category drawer's "Styling Notes" section
 *
 * Returns null when there are no tips so the admin can hide the band
 * entirely by leaving every slot blank.
 */

export type StylingTip = { title: string; body: string };

type Props = {
  title: string;
  intro: string;
  tips: StylingTip[];
};

export default function CategoryStylingGuide({ title, intro, tips }: Props) {
  const filled = tips.filter((t) => (t.title || '').trim() || (t.body || '').trim());
  if (!filled.length) return null;

  return (
    <section className="bg-ivory border-t border-maroon-deep/10">
      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 py-14 lg:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10 lg:mb-14">
          <div className="inline-flex items-center gap-3 text-gold-deep mb-4">
            <span className="block h-px w-10 bg-gold-deep/60" aria-hidden />
            <span className="text-[0.65rem] md:text-[0.72rem] tracking-[0.35em] uppercase font-bold">
              Styling Notes
            </span>
            <span className="block h-px w-10 bg-gold-deep/60" aria-hidden />
          </div>
          <h2
            className="text-[1.9rem] md:text-[2.4rem] lg:text-[2.75rem] leading-[1.05] text-ink"
            style={{
              fontFamily: 'var(--font-hero), "Italiana", Georgia, serif',
              fontWeight: 600,
            }}
          >
            {title}
          </h2>
          {intro ? (
            <p className="mt-3 text-sm md:text-base text-ink/65 leading-relaxed">
              {intro}
            </p>
          ) : null}
        </div>

        <div
          className={`grid grid-cols-1 ${
            filled.length >= 2 ? 'md:grid-cols-2' : ''
          } ${filled.length >= 4 ? 'lg:grid-cols-4' : filled.length === 3 ? 'lg:grid-cols-3' : ''}`}
        >
          {filled.map((t, i) => (
            <article
              key={`${t.title}-${i}`}
              className={`relative px-6 lg:px-8 py-6 lg:py-4 ${
                i > 0 ? 'md:border-l md:border-maroon-deep/10' : ''
              }`}
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span
                  className="font-sans text-xl md:text-2xl font-bold tabular-nums text-maroon-deep/30"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-base md:text-lg font-bold text-ink tracking-tight">
                  {t.title}
                </h3>
              </div>
              <p className="text-sm text-ink/70 leading-relaxed">
                {t.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Weave-template defaults — used by CategoryWeaveView to feed the same
// block with per-weave copy. Kept here so the weave caller doesn't have
// to own the template list.
const WEAVE_TIP_TEMPLATES: StylingTip[] = [
  {
    title: 'Blouse Pairing',
    body:
      'Pick up the darkest thread in the {weave} border for the blouse ground — the pallu reads richer when the shoulders echo its edge.',
  },
  {
    title: 'Jewellery',
    body:
      'Temple gold for weddings, uncut polki for receptions, a single kundan jhumka for an everyday {weave}. Let the zari do the talking.',
  },
  {
    title: 'The Drape',
    body:
      '{weave} sits best in the classic Nivi drape — seven even pleats, a knife-pleat pallu, and a petticoat stiff enough to hold the border straight.',
  },
  {
    title: 'When to Wear',
    body:
      'A {weave} is at home at weddings, poojas and festive evenings. For brunch or office, dress it down with a half-sleeve blouse and minimal gold.',
  },
];

export function weaveStylingTips(weave: string): StylingTip[] {
  return WEAVE_TIP_TEMPLATES.map((t) => ({
    ...t,
    body: t.body.replaceAll('{weave}', weave),
  }));
}
