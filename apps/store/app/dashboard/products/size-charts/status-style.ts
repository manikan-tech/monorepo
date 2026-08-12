import type { IngestionStatus } from "@prisma/client";

// Shared between the list and the detail page so a status can never render
// two different ways in the same feature.

export const STATUS_STYLE: Record<IngestionStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  ACTION_REQUIRED: "bg-amber-50 text-amber-800",
  COMPLETE: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
};

export const STATUS_LABEL: Record<IngestionStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  ACTION_REQUIRED: "Needs fixes",
  COMPLETE: "Complete",
  FAILED: "Failed",
};
