import type { Application as ApplicationDb, ApplicationStatus } from "../../../generated/prisma/client";
import type { S3UploadResult } from "../services/s3.service";

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
 * This acts as the single gateway for all frontend HTTP requests related to applications.
 * It serializes outgoing payloads, deserializes JSON responses, handles network/HTTP errors,
 * and formats returns into standardized types.
 * 
 * React components must import this class to interact with the API layer.
 */
export class ApplicationClient {
  private readonly baseUrl = "/api/applications";
  private readonly uploadUrl = "/api/upload-resume";

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
      const id = setTimeout(() => controller.abort(), 30000); // 30s timeout limit for file uploads

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
   * Uploads candidate's resume file to S3 via backend endpoint.
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
   * Submits a candidate's job application from the frontend form.
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
    // Compile search queries
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
    // TODO: [Future Timeline Client hook] Track changes in recruiter dashboards

    return this.request<ApplicationDb>(`${this.baseUrl}?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }
}

export const applicationClient = new ApplicationClient();
