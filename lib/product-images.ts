import { SAREES, getColorways, type Weave } from './sarees';

type Saree = (typeof SAREES)[number];

/**
 * Per-product image map.
 *
 * Source-of-truth for which photographs map to which saree, independent of
 * the generic `saree.image` catalog placeholder that lives in `lib/sarees.ts`.
 * When real product photography is added, extend the entries here — every
 * card and the PDP gallery read through these helpers.
 *
 * `hero` is the primary product photograph used on cards and as the first
 * gallery frame. `extras` are additional shots that go into the PDP gallery
 * (back view, detail, etc.). Order matters: extras are shown after the hero
 * in the thumbnail rail.
 */
const PRODUCT_IMAGES: Record<string, { hero: string; extras?: string[] }> = {
  'banarasi-raktarani': {
    hero: '/bestsellers/raktharani%20banarasi.webp',
    extras: ['/newarrivals/sindhoori%20banarasi.webp'],
  },
  'kanjivaram-mayura': {
    hero: '/bestsellers/Mayura%20kanjee.webp',
    extras: ['/newarrivals/neelambari%20kanjivaram.webp'],
  },
  'fancy-haldi': {
    hero: '/Partysarees/P1.webp',
  },
  'fancy-mehndi': {
    hero: '/Partysarees/p2.webp',
  },
  'fancy-cocktail': {
    hero: '/Partysarees/p3.webp',
  },
  'patola-rasleela': {
    hero: '/bestsellers/Rasleela%20patola2.webp',
    extras: ['/newarrivals/rangraj%20patola.webp'],
  },
  'mysore-chandrika': {
    hero: '/bestsellers/chandrika%20mysuru.webp',
  },
  // ── Mangalagiri ──
  'mangalagiri-megha': {
    hero: '/mangalagiri%20sarees/m1.webp',
  },
  'mangalagiri-chandni': {
    hero: '/mangalagiri%20sarees/m2.webp',
  },
  'mangalagiri-tulsi': {
    hero: '/mangalagiri%20sarees/m3.webp',
  },
  // ── Pochampally ──
  'pochampally-aakash': {
    hero: '/pochampally%20sarees/po1.webp',
  },
  'pochampally-bandhakala': {
    hero: '/pochampally%20sarees/po2.webp',
  },
  'pochampally-meghala': {
    hero: '/pochampally%20sarees/po3.webp',
  },
  // ── Gadwal ──
  'gadwal-konark': {
    hero: '/Gadwal%20sarees/g1.webp',
  },
  'gadwal-krishna': {
    hero: '/Gadwal%20sarees/g2.webp',
  },
  'gadwal-aishwarya': {
    hero: '/Gadwal%20sarees/g3.webp',
  },
  // ── Mixed Pattu Sarees ──
  'mixedpattu-katha': {
    hero: '/pattu%20sarees/pa1.webp',
  },
  'mixedpattu-mor': {
    hero: '/pattu%20sarees/pa2.webp',
  },
  'mixedpattu-ramayana': {
    hero: '/pattu%20sarees/pa3.webp',
  },
  'mixedpattu-shubh': {
    hero: '/pattu%20sarees/pa4.webp',
  },
  // Products without dedicated photography fall through to the generic
  // catalog image; their gallery still pulls in the weave-story shot and
  // the by-weave swatch so the gallery is never four identical frames.
};

/**
 * Weave-level fallback imagery — used as additional gallery frames so every
 * product page can show 3-4 distinct photographs even when only the
 * generic catalog image is mapped for that specific id.
 */
// Weave-level "context" shot from /public/story/. Files on disk are named
// without a "story" suffix (banarasi.png, kanjeevaram.png, etc.) — the
// older "*story.png" naming pointed at files that were never there. For
// weaves without a dedicated /story/ shot we fall back to the by-weave
// swatch so the gallery still has a frame instead of a 404.
const WEAVE_STORY: Record<Weave, string> = {
  Banarasi: '/story/banarasi.webp',
  Kanjivaram: '/story/kanjeevaram.webp',
  'Mysore Silk': '/story/Mysore%20silk.webp',
  Mangalagiri: '/story/Mangalgiri.webp',
  Pochampally: '/Byweaves/Pochampally.webp',
  Gadwal: '/story/Gadwal.webp',
  Patola: '/Byweaves/Patola.webp',
  'Fancy Sarees': '/Byweaves/fancy-saree.webp',
  'Mixed Pattu Sarees': '/Byweaves/Mixed-pattu.webp',
};

const WEAVE_SWATCH: Record<Weave, string> = {
  Banarasi: '/Byweaves/banarasi.webp',
  Kanjivaram: '/Byweaves/kanjeevaram.webp',
  'Mysore Silk': '/Byweaves/Mysore%20silk.webp',
  Mangalagiri: '/Byweaves/mangalagiri.webp',
  Pochampally: '/Byweaves/Pochampally.webp',
  Gadwal: '/Byweaves/Gadwal.webp',
  Patola: '/Byweaves/Patola.webp',
  'Fancy Sarees': '/Byweaves/fancy-saree.webp',
  'Mixed Pattu Sarees': '/Byweaves/Mixed-pattu.webp',
};

/**
 * Hero image for a saree — the single best photograph for cards and PDP
 * primary frame. Admin-uploaded `imageUrls[0]` wins; otherwise fall through
 * to the hardcoded PRODUCT_IMAGES map (static sarees) and finally the
 * catalog placeholder.
 */
export function getProductHero(saree: Saree): string {
  if (saree.imageUrls && saree.imageUrls.length) return saree.imageUrls[0];
  return PRODUCT_IMAGES[saree.id]?.hero ?? saree.image;
}

/**
 * Gallery for the PDP. Priority:
 *   1. Admin-uploaded `imageUrls` — every photograph as-is, no padding.
 *      Admin products get exactly what was uploaded; the thumbnail rail
 *      length matches what was saved.
 *   2. Hardcoded PRODUCT_IMAGES map + weave story/swatch — the legacy
 *      path for static sarees shipped before the admin existed.
 */
export function getProductGallery(saree: Saree): string[] {
  if (saree.imageUrls && saree.imageUrls.length) {
    // Admin products render exactly what was uploaded, nothing added.
    return saree.imageUrls;
  }
  const mapped = PRODUCT_IMAGES[saree.id];
  const hero = mapped?.hero ?? saree.image;
  const candidates = [
    hero,
    ...(mapped?.extras ?? []),
    WEAVE_STORY[saree.weave],
    WEAVE_SWATCH[saree.weave],
    // The original catalog image is kept last so it serves as a detail-shot
    // fallback when nothing else is available for that saree.
    saree.image,
  ];
  // De-duplicate while preserving order.
  const seen = new Set<string>();
  return candidates.filter((src) => {
    if (!src || seen.has(src)) return false;
    seen.add(src);
    return true;
  });
}

// ── Colorway galleries ────────────────────────────────────────────────────
//
// When the user clicks a colorway swatch on the PDP, the gallery on the
// left should swap entirely to images of sarees in THAT colour. We don't
// have real per-variant photography, so the gallery is sourced from other
// sarees in the catalog whose primary palette tone is closest to the
// picked colour — pick yellow and you should see only yellow sarees,
// pick maroon and you should see only maroon sarees, etc. Each matching
// saree contributes both its hero AND extras so the rail is built from
// "different view images" (multiple photos), not just one shot per saree.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

const MAX_GALLERY = 4;

// Returns the PDP "You May Also Like" strip — the saree itself first,
// then up to four same-weave siblings ranked by palette-colour
// distance. Semantically the strip is a real variant picker: on a
// Mangalagiri PDP it only shows other Mangalagiris; on a Kanjeevaram
// PDP it only shows other Kanjeevarams. If a weave has no siblings
// the strip collapses to just this saree and the caller can hide it.
const PDP_VARIANT_COUNT = 5;
// Pass `catalog` (from useLiveSarees) to pull siblings from live admin
// data. When the catalog hasn't loaded yet the siblings list is empty so
// the caller can render a skeleton instead of seeded placeholders.
export function getPdpVariants(saree: Saree, catalog?: Saree[]): Saree[] {
  if (!catalog || catalog.length === 0) return [saree];
  const siblings = catalog
    .filter((s) => s.id !== saree.id && s.weave === saree.weave)
    .map((s) => ({ s, d: rgbDistance(s.palette[0] ?? '#000000', saree.palette[0] ?? '#000000') }))
    .sort((a, b) => a.d - b.d)
    .slice(0, PDP_VARIANT_COUNT - 1)
    .map((x) => x.s);
  return [saree, ...siblings];
}

// Returns the top-ranked "other saree" whose primary hex is closest to
// the picked colourway. Used by the PDP thumbnail strip so the row can
// label each tile with the actual saree name it represents, not the
// generic palette colour. Returns null for the primary colourway (which
// is this saree itself) or when there is no sensible match.
export function getColorwaySaree(saree: Saree, colorwayId: string): Saree | null {
  const colorways = getColorways(saree);
  if (colorways.length === 0) return null;
  const primary = colorways[0];
  const selected = colorways.find((c) => c.id === colorwayId) ?? primary;
  if (selected.id === primary.id) return null;
  const ranked = SAREES
    .filter((s) => s.id !== saree.id)
    .map((s) => ({ s, d: rgbDistance(s.palette[0] ?? '#000000', selected.hex) }))
    .sort((a, b) => a.d - b.d);
  return ranked[0]?.s ?? null;
}

export function getColorwayGallery(saree: Saree, colorwayId: string): string[] {
  const productImages = saree.imageUrls?.filter(Boolean) || [];
  const mainTag = saree.imageVariant || '';

  // Empty colorwayId = "no swatch picked yet" (initial PDP paint). Show
  // the product-level main images — first paint isn't biased toward any
  // one colour. Clicking a swatch then swaps below.
  if (!colorwayId && productImages.length) return productImages;

  // Swatch picked. Resolution order:
  //   1. If the main image set is tagged with this colour → return the
  //      main images (admin labelled them for this variant).
  //   2. If the picked variant has its own per-variant `imageUrls` → use them.
  //   3. If the main set is "Shared" (untagged) → fall back to it, so a
  //      product with only a shared gallery still shows photos for every
  //      swatch.
  //   4. Otherwise → return [] so ProductGallery shows its "no image"
  //      placeholder; picking a colour that has no photos is visibly
  //      acknowledged instead of silently borrowing another colour's set.
  if (mainTag && mainTag === colorwayId && productImages.length) return productImages;

  if (saree.variants && saree.variants.length) {
    const picked = saree.variants.find((v) => v.id === colorwayId);
    const variantImages = picked?.imageUrls?.filter(Boolean) || [];
    if (variantImages.length) return variantImages;
  }

  if (!mainTag && productImages.length) return productImages;
  if (productImages.length && !saree.variants?.some((v) => v.imageUrls && v.imageUrls.length)) {
    // No per-variant images anywhere and main set untagged — fall back to
    // the shared main gallery for every swatch.
    return productImages;
  }
  return [];
}

