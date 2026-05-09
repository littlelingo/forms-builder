import type { Coordinates, FieldNode, ReviewStatus } from "@form-builder/schema";

import type { ConversionRecord, ProcessingStepStatus } from "../../../lib/types";

export function overlayRects(field: FieldNode): Coordinates[] {
  const optionRects =
    field.semanticType === "radio" || field.semanticType === "checkbox" || field.semanticType === "select"
      ? field.options.flatMap((option) =>
          option.evidence
            .map((anchor) => anchor.bounds)
            .filter((bounds): bounds is Coordinates => bounds !== undefined),
        )
      : [];

  const sourceRects = field.sourceCoordinates;
  const fallbackEvidenceRects = field.evidence
    .map((anchor) => anchor.bounds)
    .filter((bounds): bounds is Coordinates => bounds !== undefined);

  const preferredRects =
    optionRects.length > 0
      ? [...optionRects, ...sourceRects.slice(optionRects.length)]
      : sourceRects.length > 0
        ? sourceRects
        : fallbackEvidenceRects;

  const deduped = new Map<string, Coordinates>();
  for (const bounds of preferredRects) {
    const key = [
      bounds.page,
      bounds.x.toFixed(2),
      bounds.y.toFixed(2),
      bounds.width.toFixed(2),
      bounds.height.toFixed(2),
    ].join(":");
    deduped.set(key, bounds);
  }
  return [...deduped.values()];
}

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
