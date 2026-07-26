"use client";

import { useState } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from "../services/s3.service";

interface ResumeUploadProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  error?: string;
}

export function ResumeUpload({ selectedFile, onFileSelect, error: externalError }: ResumeUploadProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const file = e.target.files?.[0];

    if (!file) {
      onFileSelect(null);
      return;
    }

    // Client-side file size validation (10 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const err = `File size exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
      setValidationError(err);
      onFileSelect(null);
      return;
    }

    // Client-side extension validation
    const fileExtension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isValidExtension = ALLOWED_EXTENSIONS.includes(fileExtension);
    const isValidMime = ALLOWED_MIME_TYPES.includes(file.type) || file.type === "application/octet-stream" || file.type === "";

    if (!isValidExtension || !isValidMime) {
      const err = "Invalid file format. Only PDF, DOC, and DOCX files are allowed.";
      setValidationError(err);
      onFileSelect(null);
      return;
    }

    onFileSelect(file);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValidationError(null);
    onFileSelect(null);
  };

  const displayError = validationError || externalError;

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700 block">
        Resume / CV <span className="text-slate-400 font-normal text-xs">(Optional — PDF, DOC, DOCX up to 10MB)</span>
      </label>

      {selectedFile ? (
        <div className="relative flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-4 transition-all duration-200">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-purple-100 hover:text-purple-600 transition-colors"
            title="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center transition-all duration-200 hover:border-purple-400 hover:bg-purple-50/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors duration-200 group-hover:bg-purple-100 group-hover:text-purple-600">
            <Upload className="h-6 w-6 transition-transform duration-200 group-hover:-translate-y-0.5" />
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <p className="text-sm font-medium text-slate-700">Click to upload resume</p>
            <p className="text-xs text-slate-500">
              Supported formats: <span className="font-semibold text-slate-600">PDF, DOC, DOCX</span>
            </p>
            <p className="text-xs text-slate-400">Maximum size: 10 MB</p>
          </div>

          <input
            type="file"
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="Upload Resume"
          />
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 mt-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
