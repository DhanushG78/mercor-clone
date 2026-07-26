import type { Application as ApplicationDb, ApplicationStatus } from "../../../generated/prisma";
import type { S3UploadResult, PresignedUrlResult } from "../services/s3.service";
import type { ResumeDownloadUrlResult, ReplaceResumeInput } from "../services/resume.service";

/**
 * Reusable Client-Side API Success Structure
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * Reusable Client-Side API Error Structure
 */
export interface ApiError {
  success: false;
  message: string;
  error?: {
    code?: string;
    details?: any;
  };
}

/**
 * Combined API Response type
 */
export type ApiClientResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Request payload for submitting a job application from the frontend UI
 */
export interface SubmitApplicationRequest {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  coverLetter?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  resumeUrl?: string | null;
  resumeKey?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

/**
 * Request filters for fetching applications list
 */
export interface GetApplicationsClientFilters {
  jobId?: string;
  email?: string;
  status?: ApplicationStatus;
}

/**
 * ApplicationClient Class
 * 
 * Responsibility:
 * Central gateway for all frontend HTTP requests related to applications & file uploads.
 * Serializes outgoing payloads, deserializes JSON responses, handles network/HTTP errors,
 * and executes direct browser-to-S3 uploads via presigned URLs.
 */
export class ApplicationClient {
  private readonly baseUrl = "/api/applications";
  private readonly uploadUrl = "/api/upload-resume";
  private readonly presignedUrlEndpoint = "/api/uploads/presigned-url";

  /**
   * Helper request utility.
   * Handles timeouts, network failures, invalid JSON formats, and maps responses to ApiSuccess/ApiError.
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<ApiClientResponse<T>> {
    try {
      const headers = new Headers(options.headers);
      if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 30000); // 30s timeout limit

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(id);

      let jsonResult: any;
      try {
        jsonResult = await response.json();
      } catch (parseError) {
        return {
          success: false,
          message: `Failed to parse response payload: ${response.statusText}`,
          error: { code: "INVALID_JSON_RESPONSE", details: parseError },
        };
      }

      if (!response.ok) {
        return {
          success: false,
          message: jsonResult.message || `Request failed with status code ${response.status}`,
          error: jsonResult.error || { code: `HTTP_STATUS_${response.status}` },
        };
      }

      return {
        success: true,
        message: jsonResult.message || "Request completed successfully.",
        data: jsonResult.data,
      };

    } catch (networkError: any) {
      console.error("[API Client Network Error] Request failed:", networkError);
      
      if (networkError.name === "AbortError") {
        return {
          success: false,
          message: "Request timed out.",
          error: { code: "REQUEST_TIMEOUT" },
        };
      }

      return {
        success: false,
        message: networkError.message || "A network connectivity issue occurred.",
        error: { code: "NETWORK_FAILURE", details: networkError },
      };
    }
  }

  /**
   * Requests a temporary, short-lived presigned PUT URL from the backend
   * for direct browser-to-S3 upload.
   * 
   * Endpoint: POST /api/uploads/presigned-url
   */
  async getPresignedUploadUrl(
    fileName: string,
    mimeType: string,
    fileSize: number
  ): Promise<ApiClientResponse<PresignedUrlResult>> {
    return this.request<PresignedUrlResult>(this.presignedUrlEndpoint, {
      method: "POST",
      body: JSON.stringify({ fileName, mimeType, fileSize }),
    });
  }

  /**
   * Performs direct browser-to-S3 HTTP PUT file upload using a presigned URL.
   * If direct upload fails due to S3 CORS restrictions or browser network policy,
   * automatically falls back to server-mediated upload (/api/upload-resume).
   * 
   * @param presignedUrl Time-limited presigned PUT URL
   * @param file File object selected by candidate
   */
  async uploadFileToS3(presignedUrl: string, file: File): Promise<ApiClientResponse<S3UploadResult | undefined>> {
    try {
      const response = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/pdf",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Direct S3 upload HTTP status ${response.status}: ${response.statusText}`);
      }

      return {
        success: true,
        message: "File uploaded to Amazon S3 successfully.",
        data: undefined,
      };
    } catch (error: any) {
      console.warn("[ApplicationClient Warning] Direct browser S3 upload failed (CORS or network policy). Initiating server fallback...", error);

      // Automatic Fallback: Upload file via server endpoint (/api/upload-resume)
      try {
        const fallbackRes = await this.uploadResumeFile(file);
        if (fallbackRes.success) {
          console.log("[ApplicationClient Success] Server fallback upload completed successfully.");
          return {
            success: true,
            message: "File uploaded to Amazon S3 successfully (via server fallback).",
            data: fallbackRes.data,
          };
        }
      } catch (fallbackErr) {
        console.error("[ApplicationClient Error] Server upload fallback failed:", fallbackErr);
      }

      return {
        success: false,
        message: "S3 upload failed. Please verify your Amazon S3 bucket CORS permissions.",
        error: { code: "S3_UPLOAD_NETWORK_ERROR", details: error },
      };
    }
  }

  /**
   * Legacy fallback: Uploads candidate's resume file to S3 via backend endpoint.
   * Endpoint: POST /api/upload-resume
   */
  async uploadResumeFile(file: File): Promise<ApiClientResponse<S3UploadResult>> {
    const formData = new FormData();
    formData.append("file", file);

    return this.request<S3UploadResult>(this.uploadUrl, {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Submits a candidate's job application with S3 metadata.
   * 
   * Endpoint: POST /api/applications
   */
  async submitApplication(input: SubmitApplicationRequest): Promise<ApiClientResponse<ApplicationDb>> {
    return this.request<ApplicationDb>(this.baseUrl, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Retrieves application details by ID from the API.
   * 
   * Endpoint: GET /api/applications?id={id}
   */
  async getApplication(id: string): Promise<ApiClientResponse<ApplicationDb>> {
    return this.request<ApplicationDb>(`${this.baseUrl}?id=${id}`, {
      method: "GET",
    });
  }

  /**
   * Queries list of applications matching optional parameters.
   * 
   * Endpoint: GET /api/applications
   */
  async getApplications(filters: GetApplicationsClientFilters = {}): Promise<ApiClientResponse<ApplicationDb[]>> {
    const params = new URLSearchParams();
    if (filters.jobId) params.append("jobId", filters.jobId);
    if (filters.email) params.append("email", filters.email);
    if (filters.status) params.append("status", filters.status);

    const queryString = params.toString();
    const targetUrl = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;

    return this.request<ApplicationDb[]>(targetUrl, {
      method: "GET",
    });
  }

  /**
   * Transition application status in database.
   * 
   * Endpoint: PATCH /api/applications?id={id}
   */
  async changeApplicationStatus(id: string, status: ApplicationStatus): Promise<ApiClientResponse<ApplicationDb>> {
    return this.request<ApplicationDb>(`${this.baseUrl}?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  /**
   * Retrieves secure time-limited presigned GET download URL for an application's resume.
   * 
   * Endpoint: GET /api/applications/[id]/resume
   */
  async getResumeDownloadUrl(id: string, expiresInSeconds: number = 900): Promise<ApiClientResponse<ResumeDownloadUrlResult>> {
    return this.request<ResumeDownloadUrlResult>(`${this.baseUrl}/${id}/resume?expiresIn=${expiresInSeconds}`, {
      method: "GET",
    });
  }

  /**
   * Atomically replaces an existing resume with new S3 metadata.
   * 
   * Endpoint: PUT /api/applications/[id]/resume
   */
  async replaceApplicationResume(id: string, metadata: ReplaceResumeInput): Promise<ApiClientResponse<ApplicationDb>> {
    return this.request<ApplicationDb>(`${this.baseUrl}/${id}/resume`, {
      method: "PUT",
      body: JSON.stringify(metadata),
    });
  }

  /**
   * Deletes an application's resume and clears metadata.
   * 
   * Endpoint: DELETE /api/applications/[id]/resume
   */
  async deleteApplicationResume(id: string): Promise<ApiClientResponse<ApplicationDb>> {
    return this.request<ApplicationDb>(`${this.baseUrl}/${id}/resume`, {
      method: "DELETE",
    });
  }
}

export const applicationClient = new ApplicationClient();
