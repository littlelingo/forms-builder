import type { ReviewStatus } from "@form-builder/schema";

import type { ConversionRecord, ProcessingStepStatus } from "../../../lib/types";

export function badgeToneFromReview(status: ReviewStatus): "neutral" | "warning" | "success" {
  if (status === "accepted" || status === "reviewed") {
    return "success";
  }
  if (status === "needs_review") {
    return "warning";
  }
  return "neutral";
}

export function badgeToneFromStatus(status: ConversionRecord["status"]): "neutral" | "warning" | "error" | "success" {
  if (status === "failed") {
    return "error";
  }
  if (status === "accepted") {
    return "success";
  }
  if (status === "in_review") {
    return "warning";
  }
  return "neutral";
}

export function badgeToneFromStep(status: ProcessingStepStatus): "neutral" | "warning" | "error" | "success" {
  if (status === "completed") {
    return "success";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "failed") {
    return "error";
  }
  return "neutral";
}
