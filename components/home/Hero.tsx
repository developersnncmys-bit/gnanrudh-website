'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { heroSlidesApi, type ServerHeroSlide } from '@/lib/api';

/**
 * Hero — promotional campaign banner carousel. Every slide (image, copy,
 * CTA, badge, text side, focal point) comes from the admin's "Home hero
 * slides" collection. Until the fetch returns at least one visible slide,
 * the hero renders a dark skeleton — no hardcoded fallback content.
 */

type Slide = {
  id: string;
  image: string;
  mobileImage?: string;
  objectPosition?: string;
  textSide: 'left' | 'right';
  eyebrow: string;
  headline: string;
  supporting: string;
  // The CTA is rendered statically in the render tree — no per-slide label
  // or href. Fields intentionally omitted.
  badge?: { label: string; tone: 'maroon' | 'gold' };
};

const DEFAULT_OBJECT_POSITION = '50% 25%';

// Map a raw admin row onto the Slide shape the render loop expects. Empty
// strings are normalised away so `&&` checks render clean markup.
function toSlide(r: ServerHeroSlide): Slide {
  return {
    id: r._id,
    image: r.image,
    mobileImage: r.mobileImage || undefined,
    objectPosition: r.objectPosition || undefined,
    textSide: r.textSide === 'left' ? 'left' : 'right',
    eyebrow: r.eyebrow || '',
    headline: r.headline,
    supporting: r.supporting || '',
    badge: r.badgeLabel
      ? { label: r.badgeLabel, tone: r.badgeTone === 'maroon' ? 'maroon' : 'gold' }
      : undefined,
  };
}

// Dimensions shared between the live carousel and the loading skeleton so
// the hero never jumps height on first paint. Values are kept intentionally
// modest on mobile so the hero occupies ~60% of the viewport and leaves the
// nav + a glimpse of what's below in frame — the previous 88vh + 526 px
// floor took the entire phone screen on 375 × 812 devices, which is why
// the banner looked like a huge dark slab on the sim.
const HERO_SECTION_CLASS =
  [
    'relative w-full bg-[#1B0E0A] overflow-hidden',
    // Heights grow with the breakpoint so the brand still gets a cinematic
    // widescreen hero on desktop, without crushing mobile.
    'h-[60vh] sm:h-[65vh] md:h-[72vh] lg:h-[80vh] xl:h-[78vh]',
    // Floors — prevent the hero from collapsing on short viewports (e.g.
    // landscape phones) but stay well under the viewport height.
    'min-h-[360px] sm:min-h-[420px] md:min-h-[520px] lg:min-h-[600px]',
    // Caps — the cinematic feel plateaus; past these sizes the headline +
    // CTA start to look lost against a sea of image.
    'max-h-[560px] sm:max-h-[620px] md:max-h-[720px] lg:max-h-[860px] xl:max-h-[820px]',
  ].join(' ');

function HeroSkeleton() {
  return (
    <section className={HERO_SECTION_CLASS} aria-busy="true">
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          background:
            'linear-gradient(135deg, #1B0E0A 0%, #2a1812 50%, #1B0E0A 100%)',
        }}
      />
    </section>
  );
}

export default function Hero() {
  const [active, setActive] = useState(0);
  // Visible slides from the admin's /api/public/hero-slides endpoint. Rows
  // without an uploaded image are dropped so a half-configured slide never
  // renders an empty frame. Until the fetch lands and returns at least one
  // usable slide, the hero stays on the skeleton.
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    heroSlidesApi.list()
      .then((res) => {
        if (!alive) return;
        const rows = (res.items || []).filter((r) => r.image && r.headline);
        setSlides(rows.map(toSlide));
      })
      .catch(() => { /* leave slides empty — skeleton stays */ })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % slides.length);
    }, 7000);
    return () => clearInterval(id);
  }, [slides.length]);

  const next = () => setActive((a) => (a + 1) % slides.length);
  const prev = () =>
    setActive((a) => (a - 1 + slides.length) % slides.length);

  // Fetch in flight OR admin has uploaded no banners → skeleton, no copy.
  if (!loaded || !slides.length) return <HeroSkeleton />;

  return (
    <section className={HERO_SECTION_CLASS}>
      {slides.map((slide, i) => {
        const isLeft = slide.textSide === 'left';
        return (
          <div
            key={slide.id}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{
              opacity: i === active ? 1 : 0,
              pointerEvents: i === active ? 'auto' : 'none',
            }}
            aria-hidden={i !== active}
          >
            {/* Full-bleed background image. Rendered as a native <picture>
                so the browser fetches the matching crop ONLY: mobile
                phones download mob-saree*.webp and never touch the
                desktop file (and vice-versa). This is why Next's <Image>
                isn't used here — its srcset is width-based, not
                art-direction aware. `fetchPriority="high"` on slide 0
                keeps the LCP image at the top of the network queue. */}
            <picture>
              {slide.mobileImage && (
                <source
                  media="(max-width: 767px)"
                  srcSet={slide.mobileImage}
                />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image}
                alt=""
                fetchPriority={i === 0 ? 'high' : 'auto'}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  objectPosition:
                    slide.objectPosition ?? DEFAULT_OBJECT_POSITION,
                }}
              />
            </picture>

            {/* Darkening gradient on the text side. Keeps the text
                legible on whichever half it lands, lets the image breathe
                on the other half. Flipped per slide via `isLeft`. Desktop
                only — mobile shows the photograph un-dimmed. */}
            <div
              className="hidden md:block absolute inset-0 pointer-events-none"
              style={{
                background: isLeft
                  ? 'linear-gradient(90deg, rgba(27,14,10,0.82) 0%, rgba(27,14,10,0.55) 30%, rgba(27,14,10,0.15) 55%, transparent 72%)'
                  : 'linear-gradient(90deg, transparent 28%, rgba(27,14,10,0.15) 45%, rgba(27,14,10,0.55) 70%, rgba(27,14,10,0.82) 100%)',
              }}
            />


            {/* Text panel — aligned by `isLeft`. On mobile always
                centre-left so copy doesn't get cramped. When the text
                sits on the right, add extra right padding so the block
                breathes away from the viewport edge and reads as pulled
                leftward into the frame rather than hugging the corner. */}
            <div
              className={clsx(
                'relative h-full max-w-[1720px] mx-auto px-6 md:px-10 lg:px-14 flex items-start md:items-center justify-center',
                isLeft
                  ? 'md:justify-start'
                  : 'md:justify-end md:pr-20 lg:pr-32 xl:pr-44',
              )}
            >
              <div className="max-w-lg md:max-w-[min(32rem,38vw)] text-ivory text-center md:text-left pt-10 md:pt-0 md:-translate-y-[27px] lg:-translate-y-[43px]">
                {slide.badge && (
                  <span
                    className={clsx(
                      'hidden md:inline-block px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider rounded-sm mb-5',
                      slide.badge.tone === 'gold'
                        ? 'bg-gold text-ink'
                        : 'bg-maroon text-ivory',
                    )}
                  >
                    {slide.badge.label}
                  </span>
                )}
                <div className="text-[0.7rem] md:text-sm font-medium text-ivory/65 mb-2 md:mb-3 uppercase tracking-[0.2em]">
                  {slide.eyebrow}
                </div>
                <h1
                  className="text-3xl md:text-7xl lg:text-7xl font-semibold leading-[1] mb-3 md:mb-5"
                  style={{
                    fontFamily:
                      'var(--font-hero), "Italiana", Georgia, serif',
                    // Metallic-gold text — multi-stop diagonal gradient
                    // from bronze → champagne → bronze, clipped to the
                    // glyphs. Same treatment used on the Bridal Edit
                    // headline in CraftStory so the brand reads
                    // consistent across both script-face headings.
                    backgroundImage:
                      'linear-gradient(135deg, #8A5A1F 0%, #C8923F 20%, #F2C99E 45%, #FFF2D6 50%, #F2C99E 55%, #C8923F 80%, #8A5A1F 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: 'transparent',
                    filter:
                      'drop-shadow(0 2px 6px rgba(0,0,0,0.45)) drop-shadow(0 0 1px rgba(242,201,158,0.3))',
                  }}
                >
                  {slide.headline}
                </h1>
                <p className="text-xs md:text-base text-ivory/80 leading-relaxed mb-4 md:mb-7 max-w-md mx-auto md:mx-0">
                  {slide.supporting}
                </p>
                {/* CTA button — static across every slide. The admin no
                    longer controls the label or link; both are fixed so the
                    hero always drops visitors onto the New Arrivals edit. */}
                <Link
                  href="/shop?sort=new"
                  className="inline-flex items-center bg-white hover:bg-gold text-ink hover:text-ink px-5 sm:px-7 py-2 sm:py-3 text-[0.7rem] sm:text-sm font-bold uppercase tracking-[0.15em] sm:tracking-[0.18em] rounded-sm transition-colors"
                >
                  Shop New
                </Link>
              </div>
            </div>
          </div>
        );
      })}

      {/* Slide arrows — paired bottom-right. Dark translucent circles. */}

      <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8 z-10 flex items-center gap-2">
        <button
          onClick={prev}
          className="bg-black/35 hover:bg-black/55 text-ivory w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
          aria-label="Previous slide"
        >
          <LuChevronLeft size={22} strokeWidth={2} aria-hidden />
        </button>
        <button
          onClick={next}
          className="bg-black/35 hover:bg-black/55 text-ivory w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
          aria-label="Next slide"
        >
          <LuChevronRight size={22} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </section>
  );
}

