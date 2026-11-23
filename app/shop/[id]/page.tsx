import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_URL, type ServerProduct } from '@/lib/api';
import { mapProductToSaree } from '@/lib/transforms';
import ProductDetail from '@/components/shop/ProductDetail';

type Props = { params: Promise<{ id: string }> };

// Live catalogue only — no static fallback. Any failure (404, network, bad
// payload) returns null, which the page function below turns into a 404.
async function loadSaree(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/public/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
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
