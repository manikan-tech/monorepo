"use client";

import { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-forest-950/40 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-card overflow-hidden animate-fade-in-up border border-forest-900/5">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-forest-100">
          <h3 className="font-display text-lg font-semibold text-forest-950">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 text-forest-700/60 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {children}
        </div>

        {/* Action Buttons */}
        <div className="p-5 bg-forest-50/50 flex justify-end gap-3 border-t border-forest-100">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-forest-900 hover:bg-forest-800 transition-colors shadow-soft"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
