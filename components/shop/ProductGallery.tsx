'use client';

import Image from 'next/image';
import { useState, useRef } from 'react';

/**
 * ProductGallery — Kalki-style PDP gallery.
 *
 * Vertical thumbnail rail on the left, large main image on the right with a
 * hover-to-zoom magnifier overlay. On hover, the cursor area is sampled and
 * the same image is shown at higher scale, anchored to the cursor position.
 */
export default function ProductGallery({
  images,
  videoUrl,
  alt,
  hasColourPicker = true,
}: {
  images: string[];
  // Optional admin-uploaded drape video. When present, rendered as the
  // last thumbnail in the rail; selecting it swaps the main stage from
  // the zoomable <Image> to a native <video> player.
  videoUrl?: string;
  alt: string;
  // False when the product has no colour picker (e.g. the bulk-upload
  // "no colour variant" case). Drives the empty-state copy so we don't
  // tell the shopper to "pick another colour" when there's no picker.
  hasColourPicker?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Build a combined slide list: all images, then the video as a virtual
  // slot with src `__video__`. `active` indexes into this list.
  const VIDEO_SENTINEL = '__video__';
  const slides: string[] = videoUrl ? [...images, VIDEO_SENTINEL] : images;
  const main = slides[active] ?? slides[0];
  const activeIsVideo = main === VIDEO_SENTINEL;

  // Empty gallery — happens when a swatch is clicked for a colour the
  // admin hasn't uploaded photos for. Render an aspect-locked placeholder
  // in the same frame so the layout doesn't jump and the swatch click
  // feels like something happened.
  if (!images.length) {
    const emptyCopy = hasColourPicker
      ? 'Photos for this colour are being added. Pick another colour to see the gallery.'
      : 'Photos for this product are being added.';
    const emptyAria = hasColourPicker
      ? `${alt} — no photo uploaded for this colour yet`
      : `${alt} — no photo uploaded yet`;
    return (
      <div className="flex gap-3 lg:gap-4 lg:ml-[100px]">
        <div className="hidden md:block w-20 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div
            className="relative aspect-[1/1] overflow-hidden bg-gray-100 flex items-center justify-center text-center px-6"
            role="img"
            aria-label={emptyAria}
          >
            <div className="text-sm text-gray-500 max-w-[260px]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-gray-400" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="m21 16-5-5-9 9" />
              </svg>
              {emptyCopy}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Track cursor / finger position relative to the stage so the zoom
  // layer can anchor to it. Takes raw coords so it works for both mouse
  // events (clientX/Y on MouseEvent) and touch events (clientX/Y on
  // Touch). One source of truth, two input paths registered below.
  const updatePos = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  return (
    <div className="flex gap-3 lg:gap-4 lg:ml-[100px]">
      {/* Vertical thumbnails — desktop. Video (if present) sits last with
          a centred play-icon overlay to signal it's a clip, not a photo. */}
      <div className="hidden md:flex flex-col gap-2 w-20 shrink-0">
        {slides.map((src, i) => {
          const isVideo = src === VIDEO_SENTINEL;
          const label = isVideo ? 'Play drape video' : `View image ${i + 1}`;
          return (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={label}
              className={`relative aspect-[4/5] overflow-hidden border-2 transition-colors ${
                i === active ? 'border-gray-900' : 'border-transparent hover:border-gray-400'
              }`}
            >
              {isVideo ? (
                <>
                  <video
                    src={videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover bg-gray-900"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35" aria-hidden>
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/90 text-gray-900">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7L8 5Z" />
                      </svg>
                    </span>
                  </span>
                </>
              ) : (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Main stage. Images get the zoom affordance; the video slide
          renders a native <video> player instead and skips zoom entirely. */}
      <div className="flex-1 min-w-0">
        {activeIsVideo && videoUrl ? (
          <div className="relative aspect-[1/1] overflow-hidden bg-gray-900">
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          </div>
        ) : (
          <div
            ref={stageRef}
            // ── Desktop: hover-driven zoom ────────────────────────────────
            onMouseEnter={(e) => {
              setZoom(true);
              updatePos(e.clientX, e.clientY);
            }}
            onMouseMove={(e) => updatePos(e.clientX, e.clientY)}
            onMouseLeave={() => setZoom(false)}
            // ── Touch: press-and-pan zoom ─────────────────────────────────
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              setZoom(true);
              updatePos(t.clientX, t.clientY);
            }}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (!t) return;
              updatePos(t.clientX, t.clientY);
            }}
            onTouchEnd={() => setZoom(false)}
            onTouchCancel={() => setZoom(false)}
            style={{ touchAction: 'none' }}
            className="relative aspect-[1/1] overflow-hidden bg-gray-100 cursor-zoom-in select-none"
          >
            <Image
              src={main}
              alt={alt}
              fill
              priority
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 600px"
              quality={95}
              className="object-cover"
              style={{ opacity: zoom ? 0 : 1, transition: 'opacity 150ms' }}
            />
            {/* Zoom layer — same image, scaled, anchored to cursor */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${main})`,
                backgroundSize: '200%',
                backgroundPosition: `${pos.x}% ${pos.y}%`,
                backgroundRepeat: 'no-repeat',
                opacity: zoom ? 1 : 0,
                transition: 'opacity 150ms',
              }}
            />
            {!zoom && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
                Hover or tap to zoom
              </div>
            )}
          </div>
        )}

        {/* Mobile thumb strip — mirrors the desktop rail, video last. */}
        <div className="md:hidden mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {slides.map((src, i) => {
            const isVideo = src === VIDEO_SENTINEL;
            const label = isVideo ? 'Play drape video' : `View image ${i + 1}`;
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={label}
                className={`relative aspect-[4/5] w-16 shrink-0 overflow-hidden border-2 ${
                  i === active ? 'border-gray-900' : 'border-transparent'
                }`}
              >
                {isVideo ? (
                  <>
                    <video
                      src={videoUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover bg-gray-900"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35" aria-hidden>
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-gray-900">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7L8 5Z" />
                        </svg>
                      </span>
                    </span>
                  </>
                ) : (
                  <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
