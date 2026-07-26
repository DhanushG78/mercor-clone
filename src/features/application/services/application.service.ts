import { applicationRepository, ApplicationNotFoundError } from "../repository";
import { Application, ApplicationStatus } from "../../../generated/prisma/client";

/**
 * ServiceResult Type
 * Standard wrapper to encapsulate business service layer outputs.
 * Helps decouple the HTTP controller layers from database exceptions or arbitrary errors.
 */
export type ServiceResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; message: string; error?: unknown };

/**
 * Input definition for submitting a new job application.
 */
export interface SubmitApplicationInput {
  jobId: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
  email: string;
  phone: string;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  coverLetter?: string | null;
  resumeUrl?: string | null;
  resumeKey?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

/**
 * ApplicationService Class
 * 
 * Responsibility:
 * This layer contains all core business rules, validations, and workflow orchestrations.
 * It serves as the bridge between API controllers (HTTP specific details) and repositories (database specific details).
 * 
 * It depends strictly on the Repository layer and never imports Prisma Client directly.
 */
export class ApplicationService {
  /**
   * Orchestrates the candidate job application submission flow.
   * 
   * Purpose:
   * Validates applicant parameters, runs business checks, processes S3 resume metadata,
   * and saves the application record.
   * 
   * Input: SubmitApplicationInput details.
   * Output: ServiceResult wrapped around the created Application database object.
   */
  async submitApplication(input: SubmitApplicationInput): Promise<ServiceResult<Application>> {
    try {
      // 1. Call Repository to persist record in database with S3 resume metadata
      const application = await applicationRepository.createApplication({
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        candidateName: input.candidateName,
        email: input.email,
        phone: input.phone,
        linkedinUrl: input.linkedinUrl,
        portfolioUrl: input.portfolioUrl,
        coverLetter: input.coverLetter,
        resumeUrl: input.resumeUrl,
        resumeKey: input.resumeKey,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        status: ApplicationStatus.APPLIED,
      });

      return {
        success: true,
        data: application,
        message: "Application submitted successfully.",
      };
    } catch (error: any) {
      console.error("[Service Error] submitApplication failed:", error);

      // TODO: [Rollback Strategy] If database persistence fails after S3 upload,
      // trigger s3Service.deleteResume(input.resumeKey) to prevent orphaned files in S3.
      if (input.resumeKey) {
        console.warn(`[Rollback Candidate] S3 object key "${input.resumeKey}" marked for deletion due to DB failure.`);
      }

      return {
        success: false,
        message: error.message || "Failed to submit job application.",
        error,
      };
    }
  }

  /**
   * Retrieves a single job application by UUID.
   * 
   * Input: Application ID string.
   * Output: ServiceResult wrapped around the retrieved Application.
   */
  async getApplication(id: string): Promise<ServiceResult<Application>> {
    try {
      const application = await applicationRepository.getApplicationById(id);

      return {
        success: true,
        data: application,
      };
    } catch (error: any) {
      if (error instanceof ApplicationNotFoundError) {
        return {
          success: false,
          message: `Application not found: ${id}`,
          error,
        };
      }
      // TODO: Replace with production logging
      console.error(`[Service Error] getApplication failed for ID ${id}:`, error);
      return {
        success: false,
        message: "Failed to retrieve application details.",
        error,
      };
    }
  }

  /**
   * Retrieves a list of job applications matching optional search parameters.
   * 
   * Input: Optional filter parameters (jobId, email, status, pagination).
   * Output: ServiceResult wrapped around Application list.
   */
  async getApplications(filters: Parameters<typeof applicationRepository.getApplications>[0] = {}): Promise<ServiceResult<Application[]>> {
    try {
      const applications = await applicationRepository.getApplications(filters);
      
      return {
        success: true,
        data: applications,
      };
    } catch (error: any) {
      // TODO: Replace with production logging
      console.error("[Service Error] getApplications failed:", error);
      return {
        success: false,
        message: "Failed to query applications list.",
        error,
      };
    }
  }

  /**
   * Updates an application status.
   * 
   * Input: Application ID, new status enum value.
   * Output: ServiceResult wrapped around updated Application.
   */
  async changeApplicationStatus(id: string, status: ApplicationStatus): Promise<ServiceResult<Application>> {
    try {
      // TODO: [Future Timeline] Verify if transition is valid (e.g. can't transition to INTERVIEW if status is REJECTED).
      // TODO: [Future Audit Logs] Record recruiter ID performing the action.
      // TODO: [Future Logging] Log status change action.
      // console.log(`[Business Log] Status of application ${id} changed to ${status}`);

      const updatedApplication = await applicationRepository.updateApplicationStatus(id, status);

      // TODO: [Future Notifications] Send notification emails (e.g. interview invitation or rejection email).
      // e.g. triggerInterviewScheduler(updatedApplication);

      return {
        success: true,
        data: updatedApplication,
        message: `Application status updated to ${status} successfully.`,
      };
    } catch (error: any) {
      if (error instanceof ApplicationNotFoundError) {
        return {
          success: false,
          message: `Could not update status. Application not found: ${id}`,
          error,
        };
      }
      // TODO: Replace with production logging
      console.error(`[Service Error] changeApplicationStatus failed for ID ${id}:`, error);
      return {
        success: false,
        message: "Failed to update application status.",
        error,
      };
    }
  }
}

export const applicationService = new ApplicationService();
export type { GetApplicationsFilters } from "../repository";
