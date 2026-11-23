import type { Metadata } from 'next';
import ContactView from '@/components/contact/ContactView';
import LegalShell from '@/components/legal/LegalShell';
import { fetchCmsPage } from '@/lib/cms';
import { parseCmsBody, isStubBody } from '@/lib/cms-markdown';

export const metadata: Metadata = {
  title: 'Contact Us · House Of GnanRudh',
  description:
    'Get in touch with House Of GnanRudh — email, phone, WhatsApp and the Nellore boutique address. Care team replies within one working day.',
};

// Admin CMS page name — must match the label used in the admin seed /
// Storefront pages table. When the admin writes a non-stub body we render
// it via LegalShell; otherwise the bespoke ContactView takes over.
const CMS_NAME = 'Contact';

export default async function ContactPage() {
  const page = await fetchCmsPage(CMS_NAME);
  const useCms = page && !isStubBody(page.body);
  if (useCms) {
    const parsed = parseCmsBody(page.body || '');
    return (
      <LegalShell
        title={page.name || 'Contact Us'}
        lastUpdated={page.updated || ''}
        intro={parsed.intro}
        sections={parsed.sections}
      />
    );
  }
  return <ContactView />;
}
