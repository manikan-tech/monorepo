"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../../components/Modal";
import { deleteAllProducts } from "../../actions/product";

export default function DeleteAllProductsButton() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const router = useRouter();

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      await deleteAllProducts();
      setShowConfirmModal(false);
      router.refresh();
    } catch (error) {
      console.error(error);
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
              className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete All"}
            </button>
          </div>
        }
      >
        <div className="text-forest-700 text-sm whitespace-pre-line leading-relaxed">
          Are you sure you want to delete <strong>all</strong> your products? This action cannot be undone.
        </div>
      </Modal>
    </>
  );
}
