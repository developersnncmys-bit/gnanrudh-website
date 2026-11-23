'use client';

import { useCallback, useEffect, useState } from 'react';
import { reviewsApi } from './api';

export type Review = {
  id: number;
  productId: string;
  name: string;
  rating: number; // 1..5
  comment: string;
  createdAt: number;
};

const STORAGE_KEY = 'gnanrudh-reviews-v1';

function readAll(): Review[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Review[]) : [];
  } catch {
    return [];
  }
}

function writeAll(reviews: Review[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch {
    /* quota / disabled */
  }
}

/**
 * useReviews — hydration-safe hook returning the reviews for a product, an
 * `add` function, and an aggregate (count + average). Reviews persist in
 * localStorage so they survive reloads; cross-tab edits are mirrored via the
 * native `storage` event.
 */
export function useReviews(productId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Seed from localStorage first — paints instantly. Then overlay the
    // server's published reviews for this product on top (customer-made
    // reviews from the admin CRM). Server reviews win on id collision.
    const local = readAll().filter((r) => r.productId === productId);
    setReviews(local);
    setHydrated(true);
    reviewsApi.list({ pid: productId, limit: 50 })
      .then((res) => {
        const serverRows: Review[] = (res.items || []).map((r) => ({
          id: Number(String(r._id).replace(/\D/g, '').slice(-9)) || Date.now(),
          productId,
          name: 'Verified Buyer',
          rating: Number(r.rating) || 0,
          comment: r.text || '',
          createdAt: Date.parse(r.at) || Date.now(),
        }));
        setReviews((prev) => {
          const byId = new Map<number, Review>();
          for (const r of prev) byId.set(r.id, r);
          for (const r of serverRows) byId.set(r.id, r);
          return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
        });
      })
      .catch(() => { /* keep local state */ });
  }, [productId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setReviews(readAll().filter((r) => r.productId === productId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [productId]);

  const add = useCallback(
    (review: Omit<Review, 'id' | 'productId' | 'createdAt'>) => {
      const all = readAll();
      const next: Review = {
        ...review,
        id: Date.now() + Math.floor(Math.random() * 1000),
        productId,
        createdAt: Date.now(),
      };
      const updated = [next, ...all];
      writeAll(updated);
      setReviews(updated.filter((r) => r.productId === productId));
    },
    [productId],
  );

  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
    : 0;

  return { reviews, hydrated, add, count, average };
}
