import type { Metadata } from 'next';
import LegalShell, { type LegalSection } from '@/components/legal/LegalShell';
import { fetchCmsPage } from '@/lib/cms';
import { parseCmsBody, isStubBody } from '@/lib/cms-markdown';

export const metadata: Metadata = {
  title: 'GST Policy · House Of GnanRudh',
  description:
    'House Of GnanRudh GST policy — tax invoices, credit notes, GSTIN usage on B2B orders and how we report taxable sales.',
};

// Admin CMS page name — matches the label in the admin seed / Storefront
// pages table. No bespoke fallback page exists; when the body is a stub
// we render the hardcoded fallback copy below.
const CMS_NAME = 'GST policy';
const FALLBACK_UPDATED = '12 November 2026';
const FALLBACK_INTRO = (
  <p>
    All orders from <strong className="text-ink">HOUSE OF GNANRUDH</strong>{' '}
    are billed under our Indian GSTIN. Every invoice we issue is a valid
    tax invoice and can be used for input-credit claims where eligible.
  </p>
);

const FALLBACK_SECTIONS: LegalSection[] = [
  {
    id: 'tax-invoice',
    title: '1. Tax Invoice',
    body: (
      <p>
        A GST-compliant tax invoice is generated for every paid order and
        sent to the registered email address at the time of dispatch. The
        invoice shows the HSN code, taxable value and the CGST / SGST /
        IGST components as applicable.
      </p>
    ),
  },
  {
    id: 'gstin-on-order',
    title: '2. Adding your GSTIN',
    body: (
      <p>
        Business customers who need their GSTIN on the invoice can share
        it at checkout in the order notes, or write to our care team
        within 24 hours of placing the order. GSTIN changes are not
        possible after the invoice has been issued.
      </p>
    ),
  },
  {
    id: 'credit-notes',
    title: '3. Credit Notes',
    body: (
      <p>
        When a refund is processed against a returned order, we issue a
        GST-compliant credit note that reverses the tax collected on the
        original invoice. A copy is emailed along with the refund
        acknowledgement.
      </p>
    ),
  },
  {
    id: 'rate-of-tax',
    title: '4. Rate of Tax',
    body: (
      <p>
        Handloom and handwoven sarees are billed at the GST rate notified
        by the Government of India from time to time. The exact rate
        applied to your order is shown as a separate line on the tax
        invoice.
      </p>
    ),
  },
  {
    id: 'reporting',
    title: '5. Reporting',
    body: (
      <p>
        We report every taxable sale in our monthly GSTR-1 filing. If you
        cannot locate your invoice in your GSTR-2A / 2B after 45 days of
        purchase, please contact us with your order number and we will
        reconcile.
      </p>
    ),
  },
];

export default async function GstPolicyPage() {
  const page = await fetchCmsPage(CMS_NAME);
  const useCms = page && !isStubBody(page.body);
  const parsed = useCms ? parseCmsBody(page.body || '') : null;

  return (
    <LegalShell
      title="GST Policy"
      lastUpdated={page?.updated || FALLBACK_UPDATED}
      intro={parsed?.intro ?? FALLBACK_INTRO}
      sections={parsed?.sections?.length ? parsed.sections : FALLBACK_SECTIONS}
    />
  );
}
