"use client";

import { type ButtonHTMLAttributes, useEffect, useRef, useState } from "react";
import Image from "next/image";
import HumanUploader from "./human-uploader";
import GarmentCatalog from "./garment-catalog";
import GuidedTour from "./guided-tour";
import { Garment } from "./product-card";

type Vton2DProps = {
    initialSelectedGarmentId?: string;
};

// Firefox honors this standard attribute on buttons, but React's button type
// does not currently include it. Keeping it in a typed spread preserves the
// server-rendered attribute that prevents stale disabled-state restoration.
const FIREFOX_STATE_RESTORE_GUARD = {
    autoComplete: "off",
} as unknown as ButtonHTMLAttributes<HTMLButtonElement>;

export default function Vton2D({ initialSelectedGarmentId }: Vton2DProps) {
    const [humanFile, setHumanFile] = useState<File | null>(null);
    const [humanPreviewUrl, setHumanPreviewUrl] = useState<string | null>(null);
    const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>("");
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultSource, setResultSource] = useState<"live" | "cached" | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const resultSectionRef = useRef<HTMLDivElement>(null);

    // Keep the server markup and the browser's first render identical. The
    // catalog and selected-file state are browser-only, so the action remains
    // disabled until React has completed hydration.
    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!humanFile) {
            setHumanPreviewUrl(null);
            return;
        }

        const previewUrl = URL.createObjectURL(humanFile);
        setHumanPreviewUrl(previewUrl);

        return () => {
            URL.revokeObjectURL(previewUrl);
        };
    }, [humanFile]);

    useEffect(() => {
        if (!resultUrl) return;

        resultSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }, [resultUrl]);

    const handleSelectFile = (file: File | null) => {
        setHumanFile(file);
        setResultUrl(null);
        setResultSource(null);
        setApiError(null);
    };

    const handleSelectGarment = (garment: Garment) => {
        setSelectedGarment(garment);
        setResultUrl(null);
        setResultSource(null);
        setApiError(null);
    };

    const getCachedFallbackResultUrl = (garment: Garment) => {
        const category = garment.category;
        if (category === "pants") return "/products/tshirt-black.png";
        if (category === "skirt") return "/products/tshirt-cream.png";
        if (category === "dress") return "/products/tshirt-navy.png";
        return "/products/tshirt-gray.png";
    };

    const getCachedPreviewResultUrl = async (garment: Garment) => {
        const cacheUrl = `/api/vton/cache?productId=${encodeURIComponent(garment.id)}`;
        try {
            const response = await fetch(cacheUrl, { method: "HEAD" });
            if (response.ok) {
                return cacheUrl;
            }
        } catch (error) {
            console.warn("Cached preview lookup failed:", error);
        }

        return getCachedFallbackResultUrl(garment);
    };

    const triggerVirtualTryOn = async () => {
        if (!humanFile) {
            setApiError("Please upload your photo first.");
            return;
        }

        if (!selectedGarment) {
            setApiError("Please select a garment first.");
            return;
        }

        if (!selectedGarment.imageUrl) {
            setApiError("The selected garment is missing an image.");
            return;
        }

        setIsLoading(true);
        setApiError(null);
        setResultUrl(null);

        // Dynamic logging/stepping for better UX
        const steps = [
            "Uploading model photo...",
            "Extracting human body pose and contours...",
            "Aligning garment to model shape...",
            "Generating high-resolution try-on outputs...",
            "Finalizing image layers..."
        ];

        let currentStep = 0;
        setLoadingStep(steps[currentStep] || "");

        // Interval to advance the steps visually
        const stepInterval = setInterval(() => {
            if (currentStep < steps.length - 1) {
                currentStep++;
                setLoadingStep(steps[currentStep] || "");
            }
        }, 4500);

        try {
            const formData = new FormData();
            formData.append("human_image", humanFile);
            // The server resolves the product image/category from its catalog.
            // Do not send a retailer VTON key to the browser: the first-party
            // proxy injects its server-only credential when calling /api/vton/2d.
            formData.append("product_id", selectedGarment.id);
            const response = await fetch("/api/vton/2d/proxy", {
                method: "POST",
                body: formData,
            });

            clearInterval(stepInterval);

            if (response.status === 401) {
                window.location.href = "/login";
                return;
            }

            if (!response.ok) {
                let errMsg = "API call returned an error response.";
                try {
                    const errData = await response.json();
                    errMsg = errData.error || errData.detail || errMsg;
                } catch {
                    // ignore
                }
                const error: Error & { status?: number } = new Error(errMsg);
                error.status = response.status;
                throw error;
            }

            // Read response as binary blob mapping
            setLoadingStep("Loading try-on result...");
            const imageBlob = await response.blob();
            const imageObjectURL = URL.createObjectURL(imageBlob);
            setResultUrl(imageObjectURL);
            setResultSource("live");
        } catch (err: unknown) {
            clearInterval(stepInterval);
            const errorStatus = err instanceof Error
                && "status" in err
                && typeof (err as Error & { status?: unknown }).status === "number"
                ? (err as Error & { status: number }).status
                : undefined;
            const errorMessage = err instanceof Error ? err.message : null;

            if (errorStatus && errorStatus < 500) {
                // Expected, user-fixable input problem (bad photo dimensions,
                // unsupported category, etc.) -- already surfaced inline via
                // apiError below. console.warn (not .error) so Next.js's dev
                // overlay doesn't promote a normal validation response into a
                // full-screen interstitial that hides that inline message.
                console.warn("VTON 2D validation error:", err);
                setApiError(errorMessage || "Please check your inputs and try again.");
            } else if (selectedGarment) {
                console.error("VTON 2D Error:", err);
                const cachedPreviewUrl = await getCachedPreviewResultUrl(selectedGarment);
                setResultUrl(cachedPreviewUrl);
                setResultSource("cached");
                setApiError(null);
            } else {
                console.error("VTON 2D Error:", err);
                setApiError(errorMessage || "Something went wrong during try-on synthesis. Please try again.");
            }
        } finally {
            setIsLoading(false);
            setLoadingStep("");
        }
    };

    const downloadResult = async () => {
        if (!resultUrl) return;

        const getDownloadExtension = (mimeType: string) => {
            const part = mimeType.toLowerCase().split(";", 1)[0];
            const normalized = (part || "").trim();
            if (normalized === "image/webp") return "webp";
            if (normalized === "image/jpeg") return "jpg";
            if (normalized === "image/jpg") return "jpg";
            if (normalized === "image/png") return "png";
            return "png";
        };

        try {
            // Turn the displayed result into a same-origin Blob URL first. This
            // keeps downloads working for both live Blob results and cached images.
            const response = await fetch(resultUrl);
            if (!response.ok) {
                throw new Error("Could not prepare the result for download.");
            }

            const imageBlob = await response.blob();
            const downloadExtension = getDownloadExtension(imageBlob.type || response.headers.get("content-type") || "");
            const downloadUrl = URL.createObjectURL(imageBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `manikan_tryon_${selectedGarment?.id || "result"}.${downloadExtension}`;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
        } catch (error) {
            console.error("Try-on result download failed:", error);
            setApiError("Unable to download the result. Please try again.");
        }
    };

    const resetResult = () => {
        setResultUrl(null);
        setResultSource(null);
        setApiError(null);
    };

    const resultBadge = resultSource === "cached" ? "Cached Preview" : "Live Result";
    const resultTone =
        resultSource === "cached"
            ? "bg-amber-100 text-amber-800 border-amber-200"
            : "bg-emerald-100 text-emerald-800 border-emerald-200";
    const isTryOnDisabled = !isHydrated || !humanFile || !selectedGarment || isLoading;

    return (
        <div className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8 bg-forest-50/20 min-h-screen">
            {/* Top Banner */}
            <div className="flex flex-col gap-2 border-b border-forest-100 pb-5">
                <div className="flex items-center gap-2">
                    <span className="bg-gold-500/10 text-gold-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        AI Labs
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-forest-300" />
                    <span className="text-xs text-forest-500 font-medium">Try-On Studio v1.0</span>
                </div>
                <div className="flex items-center gap-3">
                    <h1 className="font-display text-2xl md:text-3xl text-forest-900 font-semibold">
                        Virtual Try-On
                    </h1>
                    <GuidedTour />
                </div>
                <p className="text-sm text-forest-650 max-w-xl">
                    Mix and match any product from our catalog using advanced artificial intelligence shape alignment mechanisms.
                </p>
            </div>

            {/* Main Workspace Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {/* Left Side: Upload Panel */}
                <div className="flex flex-col gap-6">
                    <div className="flex-1">
                        <HumanUploader onSelectFile={handleSelectFile} />
                    </div>

                    {/* Action trigger button */}
                    {/* Firefox can restore a button's previous disabled state during a
                        hard refresh, before React hydrates. This action's enabled
                        state is derived from live file/catalog state, so it must not
                        be restored by the browser. */}
                    <button
                        id="tryon-trigger"
                        {...FIREFOX_STATE_RESTORE_GUARD}
                        onClick={triggerVirtualTryOn}
                        disabled={isTryOnDisabled}
                        className="w-full flex items-center justify-center gap-2.5 bg-forest-900 hover:bg-forest-950 text-white font-semibold py-4 px-6 rounded-2xl shadow-soft disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all duration-350"
                    >
                        {isLoading ? (
                            <>
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                <span className="tracking-wide">Synthesizing Try-On...</span>
                            </>
                        ) : (
                            <>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                </svg>
                                <span className="tracking-wide">Generate Try-On Look</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Right Side: Catalog Panel */}
                <div className="flex-1 h-full">
                    <GarmentCatalog
                        selectedGarment={selectedGarment}
                        onSelectGarment={handleSelectGarment}
                        initialSelectedGarmentId={initialSelectedGarmentId}
                    />
                </div>
            </div>

            {/* Loading Progress State Card */}
            {isLoading && (
                <div className="fixed inset-0 bg-forest-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white max-w-sm w-full rounded-2xl border border-forest-50 p-6 flex flex-col items-center text-center shadow-lift animate-fade-in">
                        <div className="relative mb-5 flex items-center justify-center">
                            <div className="h-14 w-14 animate-spin rounded-full border-4 border-gold-500 border-t-transparent" />
                            <div className="absolute h-8 w-8 rounded-full bg-forest-50 flex items-center justify-center text-forest-900">
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
                                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                            </div>
                        </div>
                        <h4 className="text-sm font-bold text-forest-950 tracking-wide uppercase">AI Engine Processing</h4>
                        <p className="text-xs text-forest-550 mt-2 font-medium leading-relaxed max-w-[240px]">
                            {loadingStep}
                        </p>
                        <span className="text-[10px] text-forest-300 mt-4 uppercase font-semibold tracking-wider">
                            This may take 15-20 seconds
                        </span>
                    </div>
                </div>
            )}

            {/* API Errors UI */}
            {apiError && (
                <div className="border border-red-150 bg-red-50/50 rounded-2xl p-4.5 flex items-start gap-3 mt-4 text-sm text-red-700 animate-slide-up">
                    <svg
                        className="mt-0.5 text-red-500 shrink-0"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                        <h4 className="font-bold">Generation Failed</h4>
                        <p className="text-xs text-red-650 mt-0.5">{apiError}</p>
                    </div>
                </div>
            )}

            {/* Try-on Result Presentation Section */}
            {resultUrl && (
                <div ref={resultSectionRef} className="border border-gold-200/80 rounded-3xl bg-white p-6 md:p-7 mt-6 shadow-soft flex flex-col gap-6 animate-slide-up">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 pb-5 border-b border-forest-50">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.2em] ${resultTone}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${resultSource === "cached" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                    {resultBadge}
                                </span>
                                {selectedGarment && (
                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-forest-100 bg-forest-50 text-[10px] font-bold uppercase tracking-[0.2em] text-forest-700">
                                        {selectedGarment.category}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h3 className="font-display text-2xl font-bold text-forest-950 leading-tight">
                                    {resultSource === "cached" ? "Preview ready for your product" : "Virtual look generated"}
                                </h3>
                                <p className="text-sm text-forest-600 mt-1 max-w-2xl">
                                    {selectedGarment
                                        ? `${selectedGarment.brand} ${selectedGarment.name} is now paired with your photo.`
                                        : "Your try-on result is ready to review."}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-forest-50 text-forest-700 text-xs font-medium border border-forest-100">
                                    <span className="font-semibold text-forest-950">Model</span>
                                    <span>{humanFile ? "Uploaded photo" : "No photo"}</span>
                                </span>
                                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-forest-50 text-forest-700 text-xs font-medium border border-forest-100">
                                    <span className="font-semibold text-forest-950">Garment</span>
                                    <span>{selectedGarment?.name || "Selected item"}</span>
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={downloadResult}
                                className="flex items-center justify-center gap-2 py-3 px-4 border border-forest-200 hover:border-forest-350 text-forest-900 font-semibold text-xs rounded-2xl shadow-sm bg-white hover:bg-forest-50/20 active:scale-[0.98] transition-all"
                            >
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
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>Download</span>
                            </button>
                            <button
                                onClick={resetResult}
                                className="flex items-center justify-center gap-2 py-3 px-4 border border-gold-300 text-gold-700 font-semibold text-xs rounded-2xl bg-gold-50/40 hover:bg-gold-50 active:scale-[0.98] transition-all"
                            >
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
                                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                                    <path d="M3 4v5h5" />
                                </svg>
                                <span>Try Another Look</span>
                            </button>
                        </div>
                    </div>

                    {/* Image Display Comparer (Local model vs Tryon result) */}
                    <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.15fr] gap-6 justify-center">
                        {/* Initial model */}
                        <div className="flex flex-col items-center gap-2.5">
                            <span className="text-xs font-bold text-forest-550 uppercase tracking-wider">Original Photo</span>
                            <div className="relative aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-2xl bg-gradient-to-br from-forest-50 to-forest-100/40 border border-forest-100/70 shadow-sm">
                                {humanPreviewUrl && (
                                    <Image
                                        src={humanPreviewUrl}
                                        alt="Original user photo"
                                        fill
                                        className="object-cover"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Generated Tryon block */}
                        <div className="flex flex-col items-center gap-2.5 border-t md:border-t-0 md:border-l border-forest-100 pt-5 md:pt-0 md:pl-6">
                            <span className="text-xs font-bold text-gold-600 uppercase tracking-wider">Try-On Output</span>
                            <div className="relative aspect-[3/4] w-full max-w-[400px] overflow-hidden rounded-2xl bg-gradient-to-br from-gold-50 to-white border-2 border-gold-300 shadow-md">
                                <Image
                                    src={resultUrl}
                                    alt="Virtual Try-On Result photo"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <p className="text-[11px] text-forest-500 text-center max-w-[300px]">
                                {resultSource === "cached"
                                    ? "This is a cached demo preview used when live inference is unavailable."
                                    : "This is the live generated try-on result."}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
