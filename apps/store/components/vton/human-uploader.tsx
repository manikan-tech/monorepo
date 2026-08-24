"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent } from "react";
import Image from "next/image";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 400;
const MIN_IMAGE_HEIGHT = 600;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

interface HumanUploaderProps {
    onSelectFile: (file: File | null) => void;
}

export default function HumanUploader({ onSelectFile }: HumanUploaderProps) {
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const validationAttemptRef = useRef(0);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
        const objectUrl = URL.createObjectURL(file);
        try {
            const image = new window.Image();
            image.src = objectUrl;
            await image.decode();
            return { width: image.naturalWidth, height: image.naturalHeight };
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    function clearSelection() {
        onSelectFile(null);
        setPreviewUrl(null);
    }

    // Parse and set file with validation
    const handleFileProcess = async (file: File) => {
        const attempt = ++validationAttemptRef.current;
        setError(null);
        clearSelection();

        // Match the formats the VTON worker decodes and sends to FASHN.ai.
        if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
            setError("Please upload an image file (PNG, JPG, or JPEG).");
            return;
        }

        // Enforce maximum file size of 5MB
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            setError("Image size exceeds the 5MB limit. Please upload a smaller file.");
            return;
        }

        let dimensions: { width: number; height: number };
        try {
            dimensions = await readImageDimensions(file);
        } catch {
            if (attempt === validationAttemptRef.current) {
                setError("This image could not be read. Please upload a valid PNG, JPG, or JPEG file.");
            }
            return;
        }

        // A newer file may have been selected while this one was decoding.
        if (attempt !== validationAttemptRef.current) return;

        if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
            setError(
                `Photo is ${dimensions.width}×${dimensions.height}px. Upload a portrait image at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px.`
            );
            return;
        }

        onSelectFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
    };

    // Drag handlers
    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            void handleFileProcess(e.dataTransfer.files[0]);
        }
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Allow the user to choose the same file again after fixing an error.
        e.target.value = "";
        if (file) {
            void handleFileProcess(file);
        }
    };

    const triggerUploadClick = () => {
        fileInputRef.current?.click();
    };

    const removeSelectedFile = () => {
        validationAttemptRef.current += 1;
        setError(null);
        clearSelection();
    };

    return (
        <div id="upload-zone" className="flex flex-col h-full bg-white rounded-2xl border border-forest-100/80 p-5 shadow-soft">
            <div>
                <h3 className="font-display text-lg font-bold text-forest-950">Upload Your Photo</h3>
                <p className="text-xs text-forest-500 mt-0.5">Provide a clear, well-lit full body or upper body portrait.</p>
            </div>

            <div className="flex-1 flex flex-col justify-center mt-4">
                {/* Main Uploader Box */}
                {!previewUrl ? (
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={triggerUploadClick}
                        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-14 px-4 cursor-pointer transition-all duration-300 min-h-[300px] ${isDragActive
                            ? "border-gold-500 bg-gold-50/20 scale-[0.99]"
                            : "border-forest-200 hover:border-forest-450 hover:bg-forest-50/15"
                            }`}
                    >
                        {/* Hidden Input field */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileInputChange}
                            accept="image/jpeg,image/png"
                            className="hidden"
                        />

                        {/* Upload Icon */}
                        <div className={`p-4 rounded-full bg-forest-50 border border-forest-100 text-forest-900 mb-4 transition-transform group-hover:scale-105 duration-300`}>
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>

                        {/* Instruction Labels */}
                        <span className="text-sm font-bold text-forest-900">Drag and drop your photo here</span>
                        <span className="text-xs text-forest-400 mt-1">or click to browse local files</span>
                        <span className="text-[10px] text-forest-300 mt-3 font-semibold uppercase tracking-wider">
                            JPEG or PNG · portrait photo · at least 400×600px · max 5MB
                        </span>
                    </div>
                ) : (
                    /* Preview Display Panel */
                    <div className="relative aspect-[3/4] w-full max-w-[340px] mx-auto overflow-hidden rounded-xl bg-forest-50/30 border border-forest-100 shadow-soft">
                        <Image
                            src={previewUrl}
                            alt="Person portrait preview"
                            fill
                            className="object-cover"
                        />

                        {/* Dark gradient overlay for bottom actions */}
                        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/70 via-transparent to-transparent" />

                        {/* Delete / Replace Buttons */}
                        <button
                            onClick={removeSelectedFile}
                            className="absolute top-3.5 right-3.5 p-2 bg-white/90 hover:bg-white text-red-650 hover:text-red-700 hover:scale-105 backdrop-blur-md rounded-full shadow-sm transition-all z-10"
                            aria-label="Remove image"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>

                        {/* Bottom info Badge */}
                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white z-10">
                            <span className="text-[11px] font-bold uppercase tracking-widest bg-forest-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-sm">
                                Active Model
                            </span>
                            <button
                                onClick={triggerUploadClick}
                                className="text-xs font-semibold text-white/90 hover:text-white underline underline-offset-4"
                            >
                                Change photo
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileInputChange}
                                accept="image/jpeg,image/png"
                                className="hidden"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Validation Error Notices */}
            {error && (
                <div className="flex items-center gap-2 mt-4 text-xs font-semibold text-red-600 bg-red-50/70 border border-red-100 rounded-xl px-4.5 py-3 animate-shake">
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
