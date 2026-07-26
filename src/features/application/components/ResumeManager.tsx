"use client";

import React, { useState } from "react";
import { applicationClient } from "../api/application.client";
import type { Application as ApplicationDb } from "../../../generated/prisma";

interface ResumeManagerProps {
  applicationId: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  resumeKey?: string | null;
  onUpdate?: (updatedApplication: ApplicationDb) => void;
  className?: string;
}

export const ResumeManager: React.FC<ResumeManagerProps> = ({
  applicationId,
  fileName: initialFileName,
  fileSize: initialFileSize,
  mimeType: initialMimeType,
  resumeKey: initialResumeKey,
  onUpdate,
  className = "",
}) => {
  const [fileName, setFileName] = useState<string | null>(initialFileName || null);
  const [fileSize, setFileSize] = useState<number | null>(initialFileSize || null);
  const [mimeType, setMimeType] = useState<string | null>(initialMimeType || null);
  const [resumeKey, setResumeKey] = useState<string | null>(initialResumeKey || null);

  const [isLoadingDownload, setIsLoadingDownload] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Format file size nicely
  const formatBytes = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return "Unknown size";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Helper for file icon badge
  const getFileTypeBadge = (type?: string | null, name?: string | null) => {
    if (type?.includes("pdf") || name?.endsWith(".pdf")) {
      return { label: "PDF", bg: "bg-red-500/10 text-red-500 border-red-500/20" };
    }
    if (type?.includes("word") || name?.endsWith(".doc") || name?.endsWith(".docx")) {
      return { label: "DOC", bg: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
    }
    return { label: "FILE", bg: "bg-primary/10 text-primary border-primary/20" };
  };

  // 1. Download / Secure View Resume
  const handleViewDownload = async () => {
    setIsLoadingDownload(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await applicationClient.getResumeDownloadUrl(applicationId, 900);

      if (!response.success || !response.data?.downloadUrl) {
        setErrorMessage(response.message || "Failed to generate secure download URL.");
        return;
      }

      // Open secure presigned GET link in new tab
      window.open(response.data.downloadUrl, "_blank", "noopener,noreferrer");
      setSuccessMessage("Secure resume link generated. Opening in new tab...");
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while opening the resume.");
    } finally {
      setIsLoadingDownload(false);
    }
  };

  // 2. Replace Resume (Presigned PUT -> Direct S3 PUT -> Atomic DB Replace API)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Step A: Validate local file
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Selected file exceeds maximum allowed size of 10 MB.");
      }

      // Step B: Get presigned PUT URL
      const presignedRes = await applicationClient.getPresignedUploadUrl(
        file.name,
        file.type || "application/pdf",
        file.size
      );

      if (!presignedRes.success || !presignedRes.data) {
        throw new Error(presignedRes.message || "Failed to generate S3 upload token.");
      }

      // Step C: Direct S3 upload from browser (with automatic server fallback)
      const uploadRes = await applicationClient.uploadFileToS3(presignedUrl, file);
      if (!uploadRes.success) {
        throw new Error(uploadRes.message || "Failed to upload replacement file to S3.");
      }

      const finalKey = uploadRes.data?.key || objectKey;
      const finalUrl = uploadRes.data?.url || objectUrl;

      // Step D: Atomically replace resume metadata in DB & cleanup legacy S3 object
      const replaceRes = await applicationClient.replaceApplicationResume(applicationId, {
        resumeUrl: finalUrl,
        resumeKey: finalKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/pdf",
      });

      if (!replaceRes.success || !replaceRes.data) {
        throw new Error(replaceRes.message || "Failed to save replacement resume details.");
      }

      // Update state
      setFileName(replaceRes.data.fileName);
      setFileSize(replaceRes.data.fileSize);
      setMimeType(replaceRes.data.mimeType);
      setResumeKey(replaceRes.data.resumeKey);
      setSuccessMessage("Resume replaced successfully!");

      if (onUpdate) {
        onUpdate(replaceRes.data);
      }
    } catch (err: any) {
      console.error("[ResumeManager Error] Replace failed:", err);
      setErrorMessage(err.message || "Failed to replace resume file.");
    } finally {
      setIsUploading(false);
      // Reset input value
      e.target.value = "";
    }
  };

  // 3. Delete Resume
  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await applicationClient.deleteApplicationResume(applicationId);

      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to delete resume.");
      }

      setFileName(null);
      setFileSize(null);
      setMimeType(null);
      setResumeKey(null);
      setShowDeleteConfirm(false);
      setSuccessMessage("Resume deleted successfully.");

      if (onUpdate) {
        onUpdate(response.data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while deleting the resume.");
    } finally {
      setIsDeleting(false);
    }
  };

  const badge = getFileTypeBadge(mimeType, fileName);

  return (
    <div className={`p-5 rounded-2xl bg-card border border-border shadow-sm space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Resume & Document Management
        </h4>
        {resumeKey && (
          <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 text-xs rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      {resumeKey ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border/60">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{fileName || "Candidate_Resume.pdf"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(fileSize)}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View / Download Button */}
            <button
              type="button"
              onClick={handleViewDownload}
              disabled={isLoadingDownload || isUploading || isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoadingDownload ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
              View Resume
            </button>

            {/* Replace Button (Hidden File Input) */}
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
              {isUploading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Replace
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                disabled={isUploading || isDeleting}
                className="hidden"
              />
            </label>

            {/* Delete Button */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting || isUploading}
              className="inline-flex items-center justify-center p-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Delete Resume"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* Empty State: Upload resume */
        <div className="p-6 text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
          <p className="text-xs text-muted-foreground mb-3">No resume currently attached to this application.</p>
          <label className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
            {isUploading ? "Uploading to S3..." : "Upload Resume"}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
          <p className="text-xs text-red-500 font-medium">
            Are you sure you want to delete this resume? This will purge the file from S3 and remove it from the application.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
