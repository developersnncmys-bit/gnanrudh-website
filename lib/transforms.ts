// Pure data transforms between the backend's admin shape (Product, Article)
// and the storefront's display shape (Saree, BlogPost). Lives outside
// `catalog.ts` so server components can import without pulling in React
// hooks or the `'use client'` boundary.

import type { ServerProduct, ServerArticle } from './api';
import type { Saree, Weave, Tier, BadgeKind } from './sarees';
import type { BlogPost } from './blog';

const KNOWN_WEAVES: Weave[] = [
  'Banarasi', 'Kanjivaram', 'Mysore Silk', 'Mangalagiri',
  'Pochampally', 'Gadwal', 'Patola', 'Fancy Sarees', 'Mixed Pattu Sarees',
];

function normaliseWeave(w?: string): Weave {
  if (!w) return 'Fancy Sarees';
  const match = KNOWN_WEAVES.find((k) => k.toLowerCase() === w.toLowerCase());
  return match || 'Fancy Sarees';
}

function tierForPrice(price: number): Tier {
  if (price >= 25000) return 'bridal';
  if (price >= 8000) return 'festive';
  return 'everyday';
}

function paletteForProduct(p: ServerProduct): string[] {
  const out = new Set<string>();
  if (p.hex) out.add(p.hex);
  if (p.zariHex) out.add(p.zariHex);
  for (const v of p.variants || []) if (v.hex) out.add(v.hex);
  if (!out.size) return ['#4A0815', '#C9A961', '#1E1B3A'];
  return Array.from(out);
}

// Every admin-uploaded URL for a product, de-duplicated and filtered to
// non-empty strings. Empty when the admin hasn't uploaded anything.
function imageUrlsFor(p: ServerProduct): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of p.imageUrls || []) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const KNOWN_BADGES: ReadonlyArray<BadgeKind> = [
  'ready', 'fast', 'last', 'bestseller', 'onsale', 'newin', 'featured',
];

export function mapProductToSaree(p: ServerProduct): Saree {
  const price = Number(p.price) || 0;
  const mrp = Number(p.compareAt) > price ? Number(p.compareAt) : Math.round(price * 1.15);
  // Admin-picked badges win — the storefront renders exactly what the
  // admin selected in the product drawer. Unknown kinds are filtered so a
  // typo doesn't break downstream BADGE_LABEL lookups.
  const badges: BadgeKind[] = Array.isArray(p.badges)
    ? p.badges.filter((b): b is BadgeKind => KNOWN_BADGES.includes(b as BadgeKind))
    : [];
  const imageUrls = imageUrlsFor(p);
  return {
    id: p._id,
    name: p.name,
    weave: normaliseWeave(p.weave),
    region: p.cat || 'India',
    tier: tierForPrice(price),
    price,
    mrp,
    badges,
    story: p.colourNote || p.care || '',
    image: imageUrls[0] || '/images/c2.jpg',
    imageUrls,
    imageVariant: typeof p.imageVariant === 'string' ? p.imageVariant : '',
    // Admin-tagged occasions (parent names + sub-occasion names). Legacy
    // records that only carry `occasion` (singular) are promoted into the
    // array so storefront filters have a single field to key off.
    occasions: Array.isArray(p.occasions) && p.occasions.length
      ? p.occasions.filter(Boolean)
      : (p.occasion ? [p.occasion] : []),
    palette: paletteForProduct(p),
    variants: (p.variants || [])
      .filter((v) => v && v.colour && v.hex)
      .map((v) => ({
        id: v.id,
        colour: v.colour,
        hex: v.hex!,
        sku: v.sku,
        stock: v.stock,
        imageUrls: Array.isArray(v.imageUrls) ? v.imageUrls.filter(Boolean) : [],
      })),
    details: {
      // No fallbacks — empty string means "admin hasn't filled this" and
      // the PDP drops the row. Weave stays separate (always present via
      // the admin's category pick).
      length: typeof p.length === 'string' ? p.length.trim() : '',
      blouse: p.blousePiece && typeof p.blouseLength === 'string' ? p.blouseLength.trim() : '',
      zari: typeof p.zari === 'string' ? p.zari.trim() : '',
      weight: undefined,
      designNo: typeof p.designNo === 'string' ? p.designNo.trim() : '',
      packContains: typeof p.packContains === 'string' ? p.packContains.trim() : '',
      manufacturedBy: typeof p.manufacturedBy === 'string' ? p.manufacturedBy.trim() : '',
      styleNo: typeof p.styleNo === 'string' ? p.styleNo.trim() : '',
      colourLabel: typeof p.colourLabel === 'string' ? p.colourLabel.trim() : '',
    },
    faqs: Array.isArray(p.faqs)
      ? p.faqs
          .map((faq) => ({
            q: String(faq?.q || '').trim(),
            a: String(faq?.a || '').trim(),
          }))
          .filter((faq) => faq.q || faq.a)
      : [],
    speciality: typeof p.speciality === 'string' ? p.speciality.trim() : '',
    styleTip: typeof p.styleTip === 'string' ? p.styleTip.trim() : '',
    fitTip: typeof p.fitTip === 'string' ? p.fitTip.trim() : '',
    shippingNote: typeof p.shippingNote === 'string' ? p.shippingNote.trim() : '',
    videoUrl: typeof p.videoUrl === 'string' ? p.videoUrl.trim() : '',
    // Per-product GST rate (percent). Only forwarded when the admin has
    // actually set a numeric value — anything else leaves it undefined so
    // the cart falls back to the storefront-wide default rate.
    gst: typeof p.gst === 'number' && Number.isFinite(p.gst) ? p.gst : undefined,
  };
}

export function mapArticleToPost(a: ServerArticle): BlogPost {
  const text = (a.body || '').trim();
  const paragraphs = text ? text.split(/\n{2,}/).filter(Boolean) : [];
  return {
    slug: a.slug || a._id,
    title: a.title,
    dek: a.seoDesc || '',
    hero: a.cover || '/story/banarasi story.webp',
    category: a.type || 'The House Edit',
    tags: [],
    publishedAt: a.date || new Date().toISOString().slice(0, 10),
    readMinutes: estimateReadMinutes(text),
    body: paragraphs.map((p) => ({ type: 'p' as const, text: p })),
  };
}

function estimateReadMinutes(body: string): number {
  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
