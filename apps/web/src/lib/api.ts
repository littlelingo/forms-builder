import type {
  AuthoringDocument,
  AuthoringProjectDetail,
  AuthoringProjectRecord,
  ProjectStatus,
  ProjectRevision,
  ReviewStatus,
} from "@form-builder/schema";

import type { ConversionRecord, SamplePdfSummary } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String(payload.detail)
        : `Request failed with status ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

export async function listConversions(): Promise<ConversionRecord[]> {
  const response = await fetch(`${API_BASE_URL}/conversions`);
  return parseResponse<ConversionRecord[]>(response);
}

export async function listSamplePdfs(): Promise<SamplePdfSummary[]> {
  const response = await fetch(`${API_BASE_URL}/sample-pdfs`);
  return parseResponse<SamplePdfSummary[]>(response);
}

export async function uploadConversion(file: File): Promise<ConversionRecord> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/conversions`, {
    method: "POST",
    body: formData,
  });

  return parseResponse<ConversionRecord>(response);
}

export async function importSampleConversion(filename: string): Promise<ConversionRecord> {
  const response = await fetch(`${API_BASE_URL}/conversions/from-sample`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename }),
  });

  return parseResponse<ConversionRecord>(response);
}

export async function patchConversionReviewStatus(
  conversionId: string,
  reviewStatus: ReviewStatus,
): Promise<ConversionRecord> {
  const response = await fetch(`${API_BASE_URL}/conversions/${conversionId}/draft`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reviewStatus }),
  });

  return parseResponse<ConversionRecord>(response);
}

export async function promoteConversion(conversionId: string): Promise<AuthoringProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/conversions/${conversionId}/promote`, {
    method: "POST",
  });

  return parseResponse<AuthoringProjectDetail>(response);
}

export async function importProjectDocument(document: AuthoringDocument): Promise<AuthoringProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/projects/from-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(document),
  });

  return parseResponse<AuthoringProjectDetail>(response);
}

export async function listProjects(): Promise<AuthoringProjectRecord[]> {
  const response = await fetch(`${API_BASE_URL}/projects`);
  return parseResponse<AuthoringProjectRecord[]>(response);
}

export async function getProject(projectId: string): Promise<AuthoringProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);
  return parseResponse<AuthoringProjectDetail>(response);
}

export async function patchProject(
  projectId: string,
  patch: { name?: string; status?: ProjectStatus },
): Promise<AuthoringProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  return parseResponse<AuthoringProjectDetail>(response);
}

export async function saveProjectDocument(
  projectId: string,
  document: AuthoringDocument,
): Promise<AuthoringProjectDetail> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/document`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(document),
  });

  return parseResponse<AuthoringProjectDetail>(response);
}

export async function listProjectRevisions(projectId: string): Promise<ProjectRevision[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/revisions`);
  return parseResponse<ProjectRevision[]>(response);
}

export async function deleteConversion(conversionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversions/${conversionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await parseResponse(response);
  }
}

export async function clearConversions(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/conversions`, {
    method: "DELETE",
  });
  const payload = await parseResponse<{ deleted: number }>(response);
  return payload.deleted;
}

export function getConversionSourceUrl(conversionId: string): string {
  return `${API_BASE_URL}/conversions/${conversionId}/source`;
}

export function getConversionPagePreviewUrl(conversionId: string, pageNumber: number): string {
  return `${API_BASE_URL}/conversions/${conversionId}/pages/${pageNumber}/preview.png`;
}
