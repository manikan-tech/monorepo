"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// --- Types ---
type Placement = "top" | "right" | "bottom" | "left";

type TourStep = {
    title: string;
    text: string;
    targetId: string;
};

type TooltipState = {
    top: number;
    left: number;
    width: number;
    placement: Placement;
    arrowTop: number;
    arrowLeft: number;
    targetLeft: number;
    targetTop: number;
    targetWidth: number;
    targetHeight: number;
};

// --- Constants ---
const STORAGE_KEY = "manikan_2d_onboarding_seen";
const TOOLTIP_WIDTH = 380;
const GAP = 18;
const VIEWPORT_PADDING = 16;

// Tour steps mapped to the target element IDs present on the page
const TOUR_STEPS: TourStep[] = [
    {
        title: "Upload Photo",
        text: "Hey there! Let's start by uploading a clear, front-facing photo of yourself here.",
        targetId: "upload-zone",
    },
    {
        title: "Choose Your Style",
        text: "Perfect! Now, browse our collections below and select the clothing item you want to try on.",
        targetId: "garment-catalog",
    },
    {
        title: "See the Magic",
        text: "You're all set! Just click 'Generate Try-On Look' and let our AI show you how the clothes look on you instantly.",
        targetId: "tryon-trigger",
    },
];

// --- Utility ---
function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

// Help icon rendered inside the floating restart button
function HelpIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.75 2.75 0 1 1 4.5 2c-.8.6-1.5 1.1-1.5 2" />
            <path d="M12 17h.01" />
        </svg>
    );
}

// Chevron icons for navigation buttons
function ChevronLeftIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    );
}

function ChevronRightIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

// --- Main Component ---
export default function GuidedTour() {
    const [open, setOpen] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [visible, setVisible] = useState(false); // controls CSS opacity animation
    const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    const activeStep = useMemo(
        (): TourStep => TOUR_STEPS[Math.min(stepIndex, TOUR_STEPS.length - 1)]!,
        [stepIndex]
    );

    // Auto-start the tour on first visit after a brief delay
    useEffect(() => {
        const seen = window.localStorage.getItem(STORAGE_KEY) === "true";
        if (!seen) {
            const timer = window.setTimeout(() => {
                setOpen(true);
            }, 500);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, []);

    // Fade-in animation: show tooltip after it mounts
    useEffect(() => {
        if (open) {
            const frame = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(frame);
        } else {
            setVisible(false);
        }
        return undefined;
    }, [open]);

    // Mark the tour as seen in localStorage
    const markSeen = () => {
        window.localStorage.setItem(STORAGE_KEY, "true");
    };

    const closeTour = () => {
        setVisible(false);
        // Scroll back to the top of the page smoothly
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });

        // Allow fade-out before unmounting
        setTimeout(() => {
            setOpen(false);
            markSeen();
        }, 220);
    };

    const restartTour = () => {
        setStepIndex(0);
        setOpen(true);
    };

    // Scroll to the active target element smoothly
    useEffect(() => {
        if (!open) return;

        // Brief delay to allow catalog updates or UI rendering
        const timer = setTimeout(() => {
            const target = document.getElementById(activeStep.targetId);
            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }, 80);

        return () => clearTimeout(timer);
    }, [activeStep.targetId, open]);

    // Dynamically compute tooltip position using getBoundingClientRect
    useEffect(() => {
        if (!open) return;

        const updatePosition = () => {
            const target = document.getElementById(activeStep.targetId);
            if (!target) {
                setTooltipState(null);
                return;
            }

            const targetRect = target.getBoundingClientRect();
            const cardRect = tooltipRef.current?.getBoundingClientRect();
            const cardWidth = Math.min(
                cardRect?.width || TOOLTIP_WIDTH,
                window.innerWidth - VIEWPORT_PADDING * 2
            );
            const cardHeight = cardRect?.height || 280;

            // Determine the best placement that fits in the viewport
            const fitsRight =
                window.innerWidth - targetRect.right >= cardWidth + GAP + VIEWPORT_PADDING;
            const fitsLeft =
                targetRect.left >= cardWidth + GAP + VIEWPORT_PADDING;
            const fitsBottom =
                window.innerHeight - targetRect.bottom >= cardHeight + GAP + VIEWPORT_PADDING;
            const fitsTop =
                targetRect.top >= cardHeight + GAP + VIEWPORT_PADDING;

            let placement: Placement = "right";
            if (fitsRight) {
                placement = "right";
            } else if (fitsLeft) {
                placement = "left";
            } else if (fitsBottom) {
                placement = "bottom";
            } else if (fitsTop) {
                placement = "top";
            } else if (window.innerWidth >= 768 && window.innerWidth > window.innerHeight) {
                // Landscape: prefer side placement closest to center
                placement = targetRect.left < window.innerWidth / 2 ? "right" : "left";
            } else {
                placement = "bottom";
            }

            // Compute card top and left position
            let top = 0;
            let left = 0;

            if (placement === "right") {
                left = clamp(
                    targetRect.right + GAP,
                    VIEWPORT_PADDING,
                    window.innerWidth - cardWidth - VIEWPORT_PADDING
                );
                top = clamp(
                    targetRect.top + targetRect.height / 2 - cardHeight / 2,
                    VIEWPORT_PADDING,
                    window.innerHeight - cardHeight - VIEWPORT_PADDING
                );
            } else if (placement === "left") {
                left = clamp(
                    targetRect.left - cardWidth - GAP,
                    VIEWPORT_PADDING,
                    window.innerWidth - cardWidth - VIEWPORT_PADDING
                );
                top = clamp(
                    targetRect.top + targetRect.height / 2 - cardHeight / 2,
                    VIEWPORT_PADDING,
                    window.innerHeight - cardHeight - VIEWPORT_PADDING
                );
            } else if (placement === "bottom") {
                left = clamp(
                    targetRect.left + targetRect.width / 2 - cardWidth / 2,
                    VIEWPORT_PADDING,
                    window.innerWidth - cardWidth - VIEWPORT_PADDING
                );
                top = clamp(
                    targetRect.bottom + GAP,
                    VIEWPORT_PADDING,
                    window.innerHeight - cardHeight - VIEWPORT_PADDING
                );
            } else {
                // top
                left = clamp(
                    targetRect.left + targetRect.width / 2 - cardWidth / 2,
                    VIEWPORT_PADDING,
                    window.innerWidth - cardWidth - VIEWPORT_PADDING
                );
                top = clamp(
                    targetRect.top - cardHeight - GAP,
                    VIEWPORT_PADDING,
                    window.innerHeight - cardHeight - VIEWPORT_PADDING
                );
            }

            // Arrow position (the small rotated square connecting card to target)
            const arrowSize = 14;

            const arrowLeft =
                placement === "right"
                    ? -arrowSize / 2
                    : placement === "left"
                        ? cardWidth - arrowSize / 2
                        : clamp(
                            targetRect.left + targetRect.width / 2 - left - arrowSize / 2,
                            14,
                            cardWidth - 18
                        );

            const arrowTop =
                placement === "bottom"
                    ? -arrowSize / 2
                    : placement === "top"
                        ? cardHeight - arrowSize / 2
                        : clamp(
                            targetRect.top + targetRect.height / 2 - top - arrowSize / 2,
                            14,
                            cardHeight - 18
                        );

            setTooltipState({
                top,
                left,
                width: cardWidth,
                placement,
                arrowTop,
                arrowLeft,
                targetLeft: targetRect.left,
                targetTop: targetRect.top,
                targetWidth: targetRect.width,
                targetHeight: targetRect.height,
            });
        };

        // Run on next frame so DOM has settled
        const frame = window.requestAnimationFrame(updatePosition);
        const handleResize = () => window.requestAnimationFrame(updatePosition);

        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleResize, true);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("scroll", handleResize, true);
        };
    }, [activeStep.targetId, open, stepIndex]);

    const goNext = () => {
        if (stepIndex >= TOUR_STEPS.length - 1) {
            closeTour();
            return;
        }
        setStepIndex((current) => current + 1);
    };

    const goBack = () => {
        setStepIndex((current) => Math.max(0, current - 1));
    };

    const isLastStep = stepIndex === TOUR_STEPS.length - 1;

    return (
        <>
            {/* ── Floating Restart Button — Dark outer circle, light gray inner circle matching webbg, z-index below navbar ── */}
            <button
                type="button"
                id="guided-tour-restart"
                onClick={restartTour}
                className="fixed bottom-5 right-5 z-[49] flex h-14 w-14 items-center justify-center rounded-full border border-forest-800/80 bg-forest-950 shadow-lift transition-all duration-300 hover:scale-110 hover:bg-forest-900 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:ring-offset-2 focus:ring-offset-transparent animate-float"
                aria-label="Restart guided tour"
                title="Restart tour"
            >
                {/* Subtle pulse ring to attract attention */}
                <span className="absolute inset-0 rounded-full bg-forest-500/20 animate-pulse-glow" aria-hidden="true" />
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-forest-200/30 bg-[#EDF4F5] backdrop-blur-md shadow-inner text-forest-950">
                    <span className="h-5 w-5">
                        <HelpIcon />
                    </span>
                </span>
            </button>

            {/* ── Subtle dark backdrop (very light tint + z-index below navbar z-50) ── */}
            {open && (
                <div
                    className="fixed inset-0 z-[47]"
                    style={{
                        backgroundColor: "rgba(10, 34, 41, 0.10)",
                        backdropFilter: "blur(1px)",
                        transition: "opacity 220ms ease",
                        opacity: visible ? 1 : 0,
                    }}
                    aria-hidden="true"
                />
            )}

            {/* ── Target Highlight Ring (glowing neon halo effect in dark green with shine) ── */}
            {open && tooltipState && (
                <div
                    className="fixed z-[48] rounded-3xl pointer-events-none"
                    style={{
                        top: tooltipState.targetTop - 8,
                        left: tooltipState.targetLeft - 8,
                        width: tooltipState.targetWidth + 16,
                        height: tooltipState.targetHeight + 16,
                        border: "3px solid rgba(18, 52, 59, 0.95)",
                        backgroundColor: "rgba(18, 52, 59, 0.03)",
                        // Dark green line outlined by a vivid teal/mid-green glow for a shining effect
                        boxShadow: "0 0 16px rgba(45, 84, 94, 0.80), inset 0 0 8px rgba(45, 84, 94, 0.40)",
                        transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                />
            )}

            {/* ── Tooltip Card — z-index below navbar z-50 ── */}
            {open && tooltipState && (
                <div
                    ref={tooltipRef}
                    id="guided-tour-tooltip"
                    role="dialog"
                    aria-modal="false"
                    aria-label={`Tour step ${stepIndex + 1}: ${activeStep.title}`}
                    className="fixed z-[49] pointer-events-auto"
                    style={{
                        top: tooltipState.top,
                        left: tooltipState.left,
                        width: tooltipState.width,
                        maxWidth: "calc(100vw - 32px)",
                        // Glassmorphic warm cream card matching store
                        borderRadius: "28px",
                        border: "1px solid rgba(45, 84, 94, 0.15)",
                        background: "rgba(244, 248, 248, 0.85)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        boxShadow:
                            "0 25px 50px -12px rgba(10, 34, 41, 0.15), 0 0 0 1px rgba(45, 84, 94, 0.05)",
                        padding: "24px",
                        color: "#0a2229",
                        opacity: visible ? 1 : 0,
                        transform: visible ? "translateY(0px) scale(1)" : "translateY(6px) scale(0.98)",
                        transition: "opacity 220ms ease, transform 220ms ease",
                    }}
                >
                    {/* ── Pointing Arrow / Triangle ──
                        A rotated square using the same glass cream background so it
                        seamlessly blends into the card edge while pointing at the target. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: tooltipState.arrowTop,
                            left: tooltipState.arrowLeft,
                            width: "14px",
                            height: "14px",
                            transform: "rotate(45deg)",
                            background: "rgba(244, 248, 248, 0.85)",
                            border: "1px solid rgba(45, 84, 94, 0.15)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            zIndex: -1, // stays behind card but visible at the edge
                        }}
                    />

                    {/* ── Card Header: label + step counter + close ── */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p
                                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                                style={{ color: "#c89666" }}
                            >
                                Guided Tour
                            </p>
                            <h3
                                className="mt-1.5 text-xl font-bold leading-snug"
                                style={{ color: "#0a2229" }}
                            >
                                {activeStep.title}
                            </h3>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {/* Step counter badge */}
                            <span
                                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                                style={{
                                    border: "1px solid rgba(45, 84, 94, 0.15)",
                                    background: "rgba(244, 248, 248, 0.95)",
                                    color: "#c89666",
                                }}
                            >
                                {stepIndex + 1} / {TOUR_STEPS.length}
                            </span>

                            {/* Close button */}
                            <button
                                type="button"
                                onClick={closeTour}
                                className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110"
                                style={{
                                    border: "1px solid rgba(45, 84, 94, 0.15)",
                                    background: "rgba(244, 248, 248, 0.95)",
                                    color: "#12343b",
                                }}
                                aria-label="Close tour"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    </div>

                    {/* ── Step Description Text ── */}
                    <p
                        className="mt-4 text-sm leading-relaxed"
                        style={{ color: "rgba(22, 60, 68, 0.85)" }}
                    >
                        {activeStep.text}
                    </p>

                    {/* ── Progress Dots ── */}
                    <div className="mt-5 flex items-center gap-2">
                        {TOUR_STEPS.map((step, index) => (
                            <button
                                key={step.targetId}
                                type="button"
                                onClick={() => setStepIndex(index)}
                                aria-label={`Go to step ${index + 1}`}
                                className="rounded-full transition-all duration-300"
                                style={{
                                    height: "8px",
                                    width: index === stepIndex ? "32px" : "8px",
                                    background:
                                        index === stepIndex
                                            ? "#c89666"
                                            : "#D4E8EB",
                                    cursor: "pointer",
                                    border: "none",
                                    padding: 0,
                                }}
                            />
                        ))}
                    </div>

                    {/* ── Navigation Buttons ── */}
                    <div className="mt-5 flex items-center justify-between gap-3">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={goBack}
                            disabled={stepIndex === 0}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                                border: "1px solid #D4E8EB",
                                background: "rgba(244, 248, 248, 0.95)",
                                color: "#0a2229",
                            }}
                        >
                            <ChevronLeftIcon />
                            Back
                        </button>

                        {/* Next / Finish primary button — matches "Generate Try-On Look" active color */}
                        <button
                            type="button"
                            onClick={goNext}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all bg-forest-900 hover:bg-forest-950 hover:-translate-y-0.5 active:scale-95"
                        >
                            {isLastStep ? "Finish" : "Next"}
                            {!isLastStep && <ChevronRightIcon />}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
