import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_URL, type ServerProduct } from '@/lib/api';
import { mapProductToSaree } from '@/lib/transforms';
import ProductDetail from '@/components/shop/ProductDetail';

type Props = { params: Promise<{ id: string }> };

// Live catalogue only — no static fallback. Any failure (404, network, bad
// payload) returns null, which the page function below turns into a 404.
// NOTE on caching: the PDP intentionally bypasses Next's data cache. Stock
// is overlaid from live Piece counts on every /api/public/products/:id
// response, and the admin can flip a variant to zero with one scan at the
// packing bench. A 60-second revalidate window — the previous default —
// meant the storefront kept showing "Selling Fast · 3 left · Add to Cart"
// for a minute after the admin had already shipped the last piece. That's
// worse than a cache miss. `cache: 'no-store'` makes every PDP request hit
// the backend; the backend already serves it in a single lean find +
// aggregate, so the cost is a few ms per visit.
async function loadSaree(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/public/products/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const p: ServerProduct = await res.json();
    return mapProductToSaree(p);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const saree = await loadSaree(id);
  if (!saree) return { title: 'Not found · House Of GnanRudh' };
  return {
    title: `${saree.name} · House Of GnanRudh`,
    description: saree.story,
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const saree = await loadSaree(id);
  if (!saree) notFound();
  return <ProductDetail saree={saree} />;
}
