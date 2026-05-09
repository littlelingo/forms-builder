import type { ProjectStatus } from "@form-builder/schema";

export function badgeToneFromProjectStatus(status: ProjectStatus): "neutral" | "success" {
  return status === "published" ? "success" : "neutral";
}
