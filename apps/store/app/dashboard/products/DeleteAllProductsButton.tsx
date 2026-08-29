"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../../components/Modal";
import { deleteAllProducts } from "../../actions/product";

export default function DeleteAllProductsButton() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [result, setResult] = useState<{ deleted: number; deactivated: number } | null>(null);
  const router = useRouter();

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const summary = await deleteAllProducts();
      setShowConfirmModal(false);
      setResult(summary);
      router.refresh();
    } catch (error) {
      console.error(error);
      setShowConfirmModal(false);
      setResult(null);
      alert("Failed to delete products.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirmModal(true)}
        className="px-5 py-2.5 rounded-lg font-medium transition-colors shadow-soft border border-red-200 bg-red-50 hover:bg-red-100 text-red-600"
      >
        Delete All
      </button>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => !isDeleting && setShowConfirmModal(false)}
        title="Delete All Products"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirmModal(false)}
              disabled={isDeleting}
              className="px-5 py-2 border border-manikan-border text-forest-700 rounded-xl text-sm font-medium hover:bg-manikan-input-bg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <span className="inline-block w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                "Yes, Delete All"
              )}
            </button>
          </div>
        }
      >
        <div className="text-forest-700 text-sm whitespace-pre-line leading-relaxed">
          Are you sure you want to delete <strong>all</strong> your products?{" "}
          Products with order history will be <strong>deactivated</strong> instead of deleted, to preserve your financial records.
        </div>
      </Modal>

      {/* Result Modal */}
      <Modal
        isOpen={!!result}
        onClose={() => setResult(null)}
        title="Done"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setResult(null)}
              className="px-5 py-2 bg-forest-900 text-white rounded-xl text-sm font-medium hover:bg-forest-800 transition-colors"
            >
              Got it
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-forest-700">
          {result && result.deleted > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">✕</span>
              <span><strong>{result.deleted}</strong> product{result.deleted !== 1 ? "s" : ""} permanently deleted.</span>
            </div>
          )}
          {result && result.deactivated > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
              <span><strong>{result.deactivated}</strong> product{result.deactivated !== 1 ? "s" : ""} had order history and were <strong>deactivated</strong> instead.</span>
            </div>
          )}
          {result && result.deleted === 0 && result.deactivated === 0 && (
            <p>No products found.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
