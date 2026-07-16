"use client";

import { useState } from "react";
import Image from "next/image";
import HumanUploader from "./human-uploader";
import GarmentCatalog from "./garment-catalog";
import { Garment } from "./product-card";

type Vton2DProps = {
    initialSelectedGarmentId?: string;
};

export default function Vton2D({ initialSelectedGarmentId }: Vton2DProps) {
    const [humanFile, setHumanFile] = useState<File | null>(null);
    const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>("");
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultSource, setResultSource] = useState<"live" | "cached" | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);

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

    const triggerVirtualTryOn = async () => {
        if (!humanFile || !selectedGarment) return;

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
            // Resolve relative URLs to absolute URLs relative to the window origin
            const absoluteGarmentUrl = selectedGarment.imageUrl.startsWith("http")
                ? selectedGarment.imageUrl
                : `${window.location.origin}${selectedGarment.imageUrl}`;
            formData.append("garment_image_url", absoluteGarmentUrl);
            formData.append("category", selectedGarment.category);
            // Hit our fastapi microservice
            const response = await fetch("http://localhost:8003/api/vton/2d", {
                method: "POST",
                body: formData,
            });

            clearInterval(stepInterval);

            if (!response.ok) {
                let errMsg = "API call returned an error response.";
                try {
                    const errData = await response.json();
                    errMsg = errData.detail || errMsg;
                } catch {
                    // ignore
                }
                throw new Error(errMsg);
            }

            // Read response as binary blob mapping
            setLoadingStep("Loading try-on result...");
            const imageBlob = await response.blob();
            const imageObjectURL = URL.createObjectURL(imageBlob);
            setResultUrl(imageObjectURL);
            setResultSource("live");
        } catch (err: any) {
            clearInterval(stepInterval);
            console.error("VTON 2D Error:", err);
            if (selectedGarment) {
                setResultUrl(getCachedFallbackResultUrl(selectedGarment));
                setResultSource("cached");
                setApiError(null);
            } else {
                setApiError(err?.message || "Something went wrong during try-on synthesis. Please try again.");
            }
        } finally {
            setIsLoading(false);
            setLoadingStep("");
        }
    };

    const downloadResult = () => {
        if (!resultUrl) return;
        const link = document.createElement("a");
        link.href = resultUrl;
        link.download = `manikan_tryon_${selectedGarment?.id || "result"}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                <h1 className="font-display text-3xl font-bold tracking-tight text-forest-950">
                    2D Virtual Try-On
                </h1>
                <p className="text-sm text-forest-650 max-w-xl">
                    Mix and match any product from our catalog using advanced artificial intelligence shape alignment mechanisms.
                </p>
            </div>

            {/* Main Workspace Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {/* Left Side: Upload Panel */}
                <div className="flex flex-col gap-6">
                    <div className="flex-1">
                        <HumanUploader selectedFile={humanFile} onSelectFile={handleSelectFile} />
                    </div>

                    {/* Action trigger button */}
                    <button
                        onClick={triggerVirtualTryOn}
                        disabled={!humanFile || !selectedGarment || isLoading}
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
                <div className="border border-gold-200/80 rounded-2xl bg-white p-6 mt-6 shadow-soft flex flex-col gap-5 animate-slide-up">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-forest-50">
                        <div>
                            <h3 className="font-display text-lg font-bold text-forest-950 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                {resultSource === "cached" ? "Cached Preview Loaded" : "Virtual Look Generated!"}
                            </h3>
                            <p className="text-xs text-forest-500 mt-0.5">
                                {resultSource === "cached"
                                    ? "Showing a local demo preview while the live model is unavailable."
                                    : `Successfully synthesized ${selectedGarment?.brand} ${selectedGarment?.name} on your model photo.`}
                            </p>
                        </div>
                        <button
                            onClick={downloadResult}
                            className="flex items-center justify-center gap-2 py-2 px-4 border border-forest-200 hover:border-forest-350 text-forest-900 font-semibold text-xs rounded-xl shadow-sm bg-white hover:bg-forest-50/20 active:scale-[0.98] transition-all"
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
                            <span>Download Image</span>
                        </button>
                    </div>

                    {/* Image Display Comparer (Local model vs Tryon result) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-center">
                        {/* Initial model */}
                        <div className="flex flex-col items-center gap-2.5">
                            <span className="text-xs font-bold text-forest-550 uppercase tracking-wider">Before</span>
                            <div className="relative aspect-[3/4] w-full max-w-[340px] items-center overflow-hidden rounded-xl bg-forest-50/40 border border-forest-100/70 shadow-sm">
                                {humanFile && (
                                    <Image
                                        src={URL.createObjectURL(humanFile)}
                                        alt="Original user photo"
                                        fill
                                        className="object-cover"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Generated Tryon block */}
                        <div className="flex flex-col items-center gap-2.5 border-t md:border-t-0 md:border-l border-forest-100 pt-5 md:pt-0 md:pl-6">
                            <span className="text-xs font-bold text-gold-600 uppercase tracking-wider">Virtual Try-On Result</span>
                            <div className="relative aspect-[3/4] w-full max-w-[340px] items-center overflow-hidden rounded-xl bg-forest-50/40 border-2 border-gold-300 shadow-md">
                                <Image
                                    src={resultUrl}
                                    alt="Virtual Try-On Result photo"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
