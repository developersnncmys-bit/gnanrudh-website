'use client';

import AccountShell from '@/components/account/AccountShell';
import { useAddresses, type Address } from '@/lib/addresses';

// /account/addresses — reads from the shared AddressProvider so saves
// made at checkout (via AddressModal) show up here, and vice versa.
// Add/Edit opens the same modal the checkout uses, so there's one form
// and one validation path for every address write in the app.

export default function AddressesPage() {
  const {
    addresses,
    selectedId,
    hydrated,
    openAddressModal,
    removeAddress,
    selectAddress,
  } = useAddresses();

  return (
    <AccountShell title="Addresses">
      <div className="flex items-center justify-between gap-4 mb-5">
        <p className="text-sm text-ink/65">
          {addresses.length === 0
            ? 'Save addresses for faster checkout.'
            : `${addresses.length} saved`}
        </p>
        <button
          type="button"
          onClick={() => openAddressModal()}
          className="bg-maroon-deep text-ivory px-5 py-2 text-sm font-semibold tracking-wide hover:bg-maroon transition-colors"
        >
          Add Address
        </button>
      </div>

      {hydrated && addresses.length === 0 && (
        <div className="bg-white border border-ink/10 p-10 md:p-14 text-center">
          <div className="mx-auto w-12 h-12 border border-ink/20 flex items-center justify-center text-ink/55">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <div className="mt-4 text-base font-semibold text-ink">
            No addresses saved
          </div>
          <p className="mt-1 text-sm text-ink/65">
            Add a shipping address to speed up future checkouts.
          </p>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((a: Address) => (
            <div key={a.id} className="bg-white border border-ink/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-ink">Home</div>
                {selectedId === a.id && (
                  <span className="text-[0.65rem] font-semibold tracking-wide uppercase border border-ink/30 px-2 py-0.5 text-ink/70">
                    Default
                  </span>
                )}
              </div>
              <div className="mt-3 text-sm text-ink/85 leading-relaxed">
                <div className="font-medium text-ink">{a.fullName}</div>
                <div>{a.line1}</div>
                {a.line2 && <div>{a.line2}</div>}
                <div>
                  {a.city}, {a.state} {a.pincode}
                </div>
                <div>{a.country}</div>
                <div className="mt-1 text-ink/65">{a.phone}</div>
                {a.email && <div className="text-ink/65">{a.email}</div>}
              </div>
              <div className="mt-4 pt-4 border-t border-ink/10 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => openAddressModal()}
                  className="text-xs font-semibold text-ink hover:text-maroon underline underline-offset-2"
                >
                  Edit
                </button>
                <span className="text-ink/30">·</span>
                <button
                  type="button"
                  onClick={() => {
                    const label = a.fullName || 'this address';
                    if (window.confirm(`Delete ${label}? This can't be undone.`)) {
                      removeAddress(a.id);
                    }
                  }}
                  className="text-xs font-semibold text-ink hover:text-maroon underline underline-offset-2"
                >
                  Delete
                </button>
                {selectedId !== a.id && (
                  <>
                    <span className="text-ink/30">·</span>
                    <button
                      type="button"
                      onClick={() => selectAddress(a.id)}
                      className="text-xs font-semibold text-ink hover:text-maroon underline underline-offset-2"
                    >
                      Set as default
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
