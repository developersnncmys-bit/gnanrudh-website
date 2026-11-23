import { API_URL } from './api';

export type CmsPage = {
  name: string;
  desc?: string;
  updated?: string;
  body?: string;
  banner?: string;
  banners?: string[];
};

// Server-side fetcher for the public CMS endpoint. Returns `null` on any
// error (404, network, malformed JSON) so callers can fall through to their
// shipped fallback content without a try/catch at every call site.
//
// `cache: 'no-store'` keeps the storefront in step with the admin without
// an explicit revalidate step — fine for policy pages that update rarely
// and don't warrant ISR plumbing.
export async function fetchCmsPage(name: string): Promise<CmsPage | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/pages/${encodeURIComponent(name)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as CmsPage;
  } catch {
    return null;
  }
}
