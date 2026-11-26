'use client';

// Live-data wrapper around the backend catalog. Each hook returns the
// familiar storefront types (Saree, blog Post) so callers don't deal with
// the raw server Product/Article shape.
//
// When the backend returns zero items — typical in a fresh dev DB — the
// hooks fall back to the static SAREES/BLOG_POSTS the storefront ships
// with. That way `/shop` and `/blog` always render something while the
// admin populates content.
//
// Loading state is exposed as `loading` so skeletons can render; errors
// are swallowed into the fallback path because a broken API shouldn't
// black-hole the entire storefront.

import { useEffect, useState } from 'react';
import {
  productsApi, journalApi, reviewsApi, categoriesApi, priceRangesApi, occasionsApi, homeBannersApi,
  type ServerReview, type ServerCategory, type ServerPriceRange, type ServerOccasion, type ServerHomeBanner,
} from './api';
import { mapProductToSaree, mapArticleToPost } from './transforms';
import type { Saree } from './sarees';
import { BLOG_POSTS, type BlogPost } from './blog';

export { mapProductToSaree, mapArticleToPost };

// ─── Hooks ─────────────────────────────────────────────────────────────

// Live product list. Returns an empty array when the backend has no active
// products — callers render a skeleton while loading, and the same skeleton
// (or an empty state) when the list stays empty. No static fallback.
export function useLiveSarees(): { sarees: Saree[]; loading: boolean } {
  const [sarees, setSarees] = useState<Saree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    productsApi.list({ limit: 100 })
      .then((res) => {
        if (!alive) return;
        setSarees((res.items || []).map(mapProductToSaree));
      })
      .catch(() => { /* leave empty — caller shows skeleton / empty state */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return { sarees, loading };
}

// Single live product. `saree` is null while loading AND when the backend
// returns 404 — callers should branch on `loading` first.
export function useLiveSaree(id: string): { saree: Saree | null; loading: boolean } {
  const [saree, setSaree] = useState<Saree | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    productsApi.get(id)
      .then((p) => alive && setSaree(mapProductToSaree(p)))
      .catch(() => { /* saree stays null — caller shows skeleton / not-found */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  return { saree, loading };
}

export function useLiveReviews(pid: string): { reviews: ServerReview[]; loading: boolean } {
  const [reviews, setReviews] = useState<ServerReview[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    reviewsApi.list({ pid, limit: 20 })
      .then((res) => alive && setReviews(res.items || []))
      .catch(() => alive && setReviews([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [pid]);
  return { reviews, loading };
}

export function useLivePosts(): { posts: BlogPost[]; loading: boolean; source: 'api' | 'static' } {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'api' | 'static'>('static');

  useEffect(() => {
    let alive = true;
    journalApi.list({ limit: 50 })
      .then((res) => {
        if (!alive) return;
        if (res.items && res.items.length) {
          setPosts(res.items.map(mapArticleToPost));
          setSource('api');
        } else {
          setPosts(BLOG_POSTS);
          setSource('static');
        }
      })
      .catch(() => alive && setPosts(BLOG_POSTS))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return { posts: posts ?? BLOG_POSTS, loading, source };
}

// Live categories for the navbar. Returns the admin-managed category list
// (saree-flagged only by default so Accessories / Lehengas don't clutter the
// weave row). Falls back to an empty list when the backend is unreachable —
// the caller is expected to provide a static shell for that case.
// House of GnanRudh is a saree-only shop, so every admin category feeds
// the storefront nav regardless of the legacy `saree` flag. The opts
// signature is kept for backward compatibility with callers that still
// pass `sareeOnly`, but the value is ignored. The old filter was a
// footgun — admins created categories with the default `saree: false`
// and then wondered why they never appeared in the Shop-by-Weave nav.
export function useLiveCategories(_opts: { sareeOnly?: boolean } = {}): {
  categories: ServerCategory[]; loading: boolean;
} {
  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    categoriesApi.list()
      .then((res) => {
        if (!alive) return;
        setCategories(res.items || []);
      })
      .catch(() => alive && setCategories([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { categories, loading };
}

// Live "Shop by price" buckets from the admin. Returns an empty list on
// error so callers can fall back to their shipped defaults (same contract
// as `useLiveCategories`).
export function useLivePriceRanges(): { priceRanges: ServerPriceRange[]; loading: boolean } {
  const [priceRanges, setPriceRanges] = useState<ServerPriceRange[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    priceRangesApi.list()
      .then((res) => alive && setPriceRanges(res.items || []))
      .catch(() => alive && setPriceRanges([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { priceRanges, loading };
}

// Live occasions from the admin. Returns the raw list (both parents and
// children) — the caller decides which level to render. Empty on error.
export function useLiveOccasions(): { occasions: ServerOccasion[]; loading: boolean } {
  const [occasions, setOccasions] = useState<ServerOccasion[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    occasionsApi.list()
      .then((res) => alive && setOccasions(res.items || []))
      .catch(() => alive && setOccasions([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { occasions, loading };
}

// Homepage promotional banners — two fixed slots ('explore' and 'bridal'),
// keyed in the returned map by slot for easy lookup. Empty on error so
// callers can fall through to their shipped defaults.
export function useLiveHomeBanners(): { banners: Record<string, ServerHomeBanner>; loading: boolean } {
  const [banners, setBanners] = useState<Record<string, ServerHomeBanner>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    homeBannersApi.list()
      .then((res) => {
        if (!alive) return;
        const map: Record<string, ServerHomeBanner> = {};
        for (const b of (res.items || [])) {
          if (b?.slot) map[b.slot] = b;
        }
        setBanners(map);
      })
      .catch(() => alive && setBanners({}))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { banners, loading };
}

export function useLivePost(slug: string): { post: BlogPost | null; loading: boolean } {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    journalApi.bySlug(slug)
      .then((a) => alive && setPost(mapArticleToPost(a)))
      .catch(() => {
        const local = BLOG_POSTS.find((p) => p.slug === slug) || null;
        if (alive) setPost(local);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);
  return { post, loading };
}
