"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import Image from "next/image";

interface HumanUploaderProps {
    selectedFile: File | null;
    onSelectFile: (file: File | null) => void;
}

export default function HumanUploader({ selectedFile, onSelectFile }: HumanUploaderProps) {
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Parse and set file with validation
    const handleFileProcess = (file: File) => {
        setError(null);

        // Enforce file checks
        if (!file.type.startsWith("image/")) {
            setError("Please upload an image file (PNG, JPG, or JPEG).");
            return;
        }

        // Enforce maximum file size of 5MB
        if (file.size > 5 * 1024 * 1024) {
            setError("Image size exceeds the 5MB limit. Please upload a smaller file.");
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
            handleFileProcess(e.dataTransfer.files[0]);
        }
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileProcess(e.target.files[0]);
        }
    };

    const triggerUploadClick = () => {
        fileInputRef.current?.click();
    };

    const removeSelectedFile = () => {
        onSelectFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-forest-100/80 p-5 shadow-soft">
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
                            accept="image/*"
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
                            Supports JPEG, JPG, PNG (Max 5MB)
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
                                accept="image/*"
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
