import { applicationRepository, ApplicationNotFoundError } from "../repository";
import { s3Service } from "./s3.service";
import type { ServiceResult } from "./application.service";
import type { Application } from "../../../generated/prisma";

export interface ResumeDownloadUrlResult {
  downloadUrl: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  expiration: string;
}

export interface ReplaceResumeInput {
  resumeUrl: string;
  resumeKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * ResumeService Class
 * 
 * Responsibilities:
 * - Dedicated service owning the entire candidate resume lifecycle.
 * - Generates secure download/view links via presigned GET URLs.
 * - Handles atomic resume replacements without leaving orphaned S3 objects.
 * - Handles resume deletion while keeping S3 and database strictly synchronized.
 * - Centralizes all resume-related business rules.
 */
export class ResumeService {
  /**
   * Generates a time-limited secure presigned GET download URL for an application's resume.
   * 
   * @param applicationId Application UUID
   * @param expiresInSeconds Duration in seconds before the signed link expires (default: 900s / 15m)
   */
  async getResumeDownloadUrl(
    applicationId: string,
    expiresInSeconds: number = 900
  ): Promise<ServiceResult<ResumeDownloadUrlResult>> {
    try {
      const application = await applicationRepository.getApplicationById(applicationId);

      if (!application.resumeKey) {
        return {
          success: false,
          message: "Application does not have an attached resume.",
        };
      }

      const downloadUrl = await s3Service.generatePresignedDownloadUrl(
        application.resumeKey,
        expiresInSeconds,
        application.fileName || undefined
      );

      const expiration = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return {
        success: true,
        data: {
          downloadUrl,
          fileName: application.fileName,
          fileSize: application.fileSize,
          mimeType: application.mimeType,
          expiration,
        },
        message: "Presigned download URL generated successfully.",
      };
    } catch (error: any) {
      if (error instanceof ApplicationNotFoundError) {
        return {
          success: false,
          message: `Application not found: ${applicationId}`,
          error,
        };
      }
      console.error(`[ResumeService Error] getResumeDownloadUrl failed for ID ${applicationId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to generate resume download link.",
        error,
      };
    }
  }

  /**
   * Atomically replaces an existing resume with a newly uploaded resume.
   * 
   * Flow:
   * 1. Retrieve current Application record to get old S3 object key.
   * 2. Update database record with new S3 metadata.
   * 3. If DB update succeeds and old S3 key exists, delete old S3 object asynchronously.
   * 4. If DB update fails, trigger S3 cleanup of new S3 object key to prevent orphaned files.
   */
  async replaceResume(
    applicationId: string,
    newResume: ReplaceResumeInput
  ): Promise<ServiceResult<Application>> {
    let oldResumeKey: string | null = null;

    try {
      // 1. Fetch current record
      const currentApplication = await applicationRepository.getApplicationById(applicationId);
      oldResumeKey = currentApplication.resumeKey;

      // 2. Validate new resume metadata
      const validation = s3Service.validateFile(
        newResume.fileName,
        newResume.fileSize,
        newResume.mimeType
      );
      if (!validation.valid) {
        // Roll back the newly uploaded file to avoid orphan
        await s3Service.deleteResume(newResume.resumeKey);
        return {
          success: false,
          message: validation.error || "Invalid replacement file.",
        };
      }

      // 3. Update database with new resume metadata
      const updatedApplication = await applicationRepository.updateResumeMetadata(
        applicationId,
        {
          resumeUrl: newResume.resumeUrl,
          resumeKey: newResume.resumeKey,
          fileName: newResume.fileName,
          fileSize: newResume.fileSize,
          mimeType: newResume.mimeType,
        }
      );

      // 4. Cleanup old S3 object if it exists and is different from new object
      if (oldResumeKey && oldResumeKey !== newResume.resumeKey) {
        console.log(`[ResumeService Atomic Replacement] Deleting legacy S3 object: ${oldResumeKey}`);
        s3Service.deleteResume(oldResumeKey).catch((delErr) => {
          console.error(`[ResumeService Warning] Failed to delete legacy S3 object ${oldResumeKey}:`, delErr);
        });
      }

      return {
        success: true,
        data: updatedApplication,
        message: "Resume replaced successfully.",
      };
    } catch (error: any) {
      console.error(`[ResumeService Error] replaceResume failed for ID ${applicationId}:`, error);

      // S3 Cleanup Rollback: Delete newly uploaded object to prevent orphaned files
      if (newResume.resumeKey) {
        console.warn(`[Rollback] Triggering cleanup for orphan S3 object key: ${newResume.resumeKey}`);
        await s3Service.deleteResume(newResume.resumeKey).catch(() => {});
      }

      if (error instanceof ApplicationNotFoundError) {
        return {
          success: false,
          message: `Application not found: ${applicationId}`,
          error,
        };
      }

      return {
        success: false,
        message: error.message || "Failed to replace resume.",
        error,
      };
    }
  }

  /**
   * Deletes an existing resume from both S3 and the database.
   * 
   * Flow:
   * 1. Retrieve current Application record to verify resume exists.
   * 2. Clear resume metadata columns in database.
   * 3. Upon successful DB update, delete S3 object key.
   */
  async deleteResume(applicationId: string): Promise<ServiceResult<Application>> {
    try {
      const application = await applicationRepository.getApplicationById(applicationId);
      const resumeKeyToDelete = application.resumeKey;

      if (!resumeKeyToDelete) {
        return {
          success: false,
          message: "Application does not have an active resume to delete.",
        };
      }

      // 1. Update DB to clear resume fields
      const updatedApplication = await applicationRepository.updateResumeMetadata(
        applicationId,
        {
          resumeUrl: null,
          resumeKey: null,
          fileName: null,
          fileSize: null,
          mimeType: null,
        }
      );

      // 2. Delete object from S3
      console.log(`[ResumeService Deletion] Purging S3 object key: ${resumeKeyToDelete}`);
      await s3Service.deleteResume(resumeKeyToDelete);

      return {
        success: true,
        data: updatedApplication,
        message: "Resume deleted successfully.",
      };
    } catch (error: any) {
      if (error instanceof ApplicationNotFoundError) {
        return {
          success: false,
          message: `Application not found: ${applicationId}`,
          error,
        };
      }
      console.error(`[ResumeService Error] deleteResume failed for ID ${applicationId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to delete resume.",
        error,
      };
    }
  }
}

export const resumeService = new ResumeService();
