'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ordersApi, paymentApi, type CustomerOrder } from '@/lib/api';
import { openRazorpay } from '@/lib/razorpay';
import { useAuth } from '@/lib/auth';
import { useLoginModal } from '@/lib/login-modal';

// /payment/retry?order=<id>
// Lands here when the Razorpay verify step fails, the browser tab closed
// mid-payment, or the webhook reconciled an order but the user wasn't
// routed to success. Fetches the order's current server state and either:
//   - Paid → routes to /payment/success
//   - Cancelled → shows cancelled card, link to cart
//   - Payment pending → reopens Razorpay with a fresh order
//   - Unknown / 404 → shows error, link home

type Phase =
  | { kind: 'loading' }
  | { kind: 'paid'; order: CustomerOrder }
  | { kind: 'cancelled'; order: CustomerOrder }
  | { kind: 'pending'; order: CustomerOrder }
  | { kind: 'reopening' }
  | { kind: 'error'; message: string };

function RetryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params?.get('order') || '';
  const { user, hydrated: authHydrated } = useAuth();
  const { openLogin } = useLoginModal();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!orderId) {
      setPhase({ kind: 'error', message: 'No order id in the URL.' });
      return;
    }
    try {
      const order = await ordersApi.get(orderId);
      const status = String(order.payment?.status || '').toLowerCase();
      if (status === 'paid') {
        setPhase({ kind: 'paid', order });
        // Auto-forward to success so the user ends up where they would
        // have landed if verify hadn't dropped.
        const qs = new URLSearchParams({
          order: order._id,
          method: order.payment?.method || 'prepaid',
          amount: String(order.total),
          ref: order.payment?.rzp || '',
        });
        router.replace(`/payment/success?${qs.toString()}`);
        return;
      }
      if (status === 'cancelled') {
        setPhase({ kind: 'cancelled', order });
        return;
      }
      setPhase({ kind: 'pending', order });
    } catch (err) {
      setPhase({ kind: 'error', message: (err as Error).message || 'Could not load order' });
    }
  }, [orderId, router]);

  useEffect(() => {
    if (!authHydrated) return;
    if (!user) {
      openLogin(() => load());
      return;
    }
    load();
  }, [authHydrated, user, openLogin, load]);

  const retry = useCallback(async () => {
    if (phase.kind !== 'pending') return;
    setPhase({ kind: 'reopening' });
    try {
      const init = await paymentApi.createOrder(phase.order._id);
      await openRazorpay({
        keyId: init.keyId,
        rzpOrderId: init.rzpOrderId,
        amount: init.amount,
        currency: init.currency,
        description: `Order ${phase.order._id}`,
        prefill: {
          name: init.customer.name,
          email: init.customer.email,
          contact: init.customer.phone,
        },
        onSuccess: async (payload) => {
          try {
            await paymentApi.verify({
              orderId: phase.order._id,
              razorpay_order_id: payload.razorpay_order_id,
              razorpay_payment_id: payload.razorpay_payment_id,
              razorpay_signature: payload.razorpay_signature,
            });
            const qs = new URLSearchParams({
              order: phase.order._id,
              method: phase.order.payment?.method || 'prepaid',
              amount: String(phase.order.total),
              ref: payload.razorpay_payment_id,
            });
            router.replace(`/payment/success?${qs.toString()}`);
          } catch (err) {
            setPhase({
              kind: 'error',
              message: `Payment received (ref ${payload.razorpay_payment_id}) but verification failed: ${(err as Error).message}. Please contact support and quote this reference — do not retry, your card has been charged.`,
            });
          }
        },
        onDismiss: async () => {
          // User backed out again. Refetch so we show the latest state —
          // if a webhook caught the capture in the meantime we don't want
          // to leave them staring at a stale "retry" screen.
          try { await paymentApi.cancel(phase.order._id); } catch { /* swallow */ }
          load();
        },
        onFailure: async () => {
          try { await paymentApi.cancel(phase.order._id); } catch { /* swallow */ }
          load();
        },
      });
    } catch (err) {
      setPhase({ kind: 'error', message: (err as Error).message || 'Could not reopen payment' });
    }
  }, [phase, router, load]);

  if (phase.kind === 'loading' || phase.kind === 'paid') {
    return (
      <Shell title="Checking payment…">
        <p className="text-sm text-ink/70">Reading the latest status from our servers.</p>
      </Shell>
    );
  }

  if (phase.kind === 'cancelled') {
    return (
      <Shell title="Payment was cancelled">
        <p className="text-sm text-ink/70">
          Order <code className="font-mono">{phase.order._id}</code> was cancelled
          and no amount was charged. Your cart items were released back to stock —
          please re-add them if you'd like to try again.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/shop"
            className="inline-flex items-center justify-center bg-ink text-ivory px-6 py-3 text-sm font-bold tracking-wider uppercase hover:bg-maroon-deep transition-colors"
          >
            Continue shopping
          </Link>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'pending') {
    return (
      <Shell title="Finish your payment">
        <p className="text-sm text-ink/70">
          Order <code className="font-mono">{phase.order._id}</code> is held open
          waiting for payment. Items are reserved for this order — complete the
          payment to confirm, or cancel to release them.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center bg-ink text-ivory px-6 py-3 text-sm font-bold tracking-wider uppercase hover:bg-maroon-deep transition-colors"
          >
            Pay ₹{phase.order.total.toLocaleString('en-IN')}
          </button>
          <button
            type="button"
            onClick={async () => {
              try { await paymentApi.cancel(phase.order._id); } catch { /* swallow */ }
              load();
            }}
            className="inline-flex items-center justify-center border border-ink/20 text-ink px-6 py-3 text-sm font-bold tracking-wider uppercase hover:border-ink transition-colors"
          >
            Cancel order
          </button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'reopening') {
    return (
      <Shell title="Opening payment…">
        <p className="text-sm text-ink/70">The Razorpay window will appear in a moment.</p>
      </Shell>
    );
  }

  return (
    <Shell title="Something went wrong">
      <p className="text-sm text-maroon font-medium leading-relaxed">{phase.message}</p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center justify-center bg-ink text-ivory px-6 py-3 text-sm font-bold tracking-wider uppercase hover:bg-maroon-deep transition-colors"
        >
          Back to home
        </Link>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-[70vh] bg-white">
      <div className="max-w-[640px] mx-auto px-6 py-16 md:py-24">
        <div className="text-[0.65rem] md:text-[0.72rem] tracking-[0.35em] uppercase font-bold text-maroon">
          Checkout
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl font-semibold text-ink">
          {title}
        </h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export default function RetryPaymentPage() {
  // useSearchParams needs a Suspense boundary at the route level under app/.
  return (
    <Suspense fallback={<Shell title="Checking payment…"><p className="text-sm text-ink/70">Reading the latest status from our servers.</p></Shell>}>
      <RetryInner />
    </Suspense>
  );
}
