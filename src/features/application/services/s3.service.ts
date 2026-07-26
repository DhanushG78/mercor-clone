import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/aws/s3";

export interface S3UploadResult {
  key: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignedUrlResult {
  presignedUrl: string;
  objectKey: string;
  objectUrl: string;
  expiration: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Supported File Restrictions
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

/**
 * S3Service Class
 * 
 * Responsibilities:
 * - Validate file metadata (size, extension, MIME type)
 * - Generate date-partitioned, collision-free S3 object keys
 * - Generate time-limited S3 presigned PUT URLs for browser direct uploads
 * - Perform fallback server S3 uploads
 * - Handle S3 DeleteObject operations for cleanup/rollback
 */
export class S3Service {
  private readonly bucketName: string;
  private readonly bucketUrl: string;

  constructor() {
    this.bucketName = process.env.AWS_BUCKET_NAME || "mercor-clone-resumes";
    const rawBucketUrl = process.env.AWS_BUCKET_URL || `https://${this.bucketName}.s3.amazonaws.com`;
    this.bucketUrl = rawBucketUrl.replace(/\/+$/, "");
  }

  /**
   * Validates file size and format restrictions.
   */
  validateFile(fileName: string, fileSize: number, mimeType: string): FileValidationResult {
    if (!fileName || fileSize <= 0) {
      return { valid: false, error: "Invalid file provided." };
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds the 10 MB limit. (Selected file: ${(fileSize / (1024 * 1024)).toFixed(2)} MB)`,
      };
    }

    const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const isValidExtension = ALLOWED_EXTENSIONS.includes(fileExtension);
    const isValidMime = ALLOWED_MIME_TYPES.includes(mimeType) || mimeType === "application/octet-stream";

    if (!isValidExtension || !isValidMime) {
      return {
        valid: false,
        error: "Invalid file format. Only PDF, DOC, and DOCX files are allowed.",
      };
    }

    return { valid: true };
  }

  /**
   * Generates a date-partitioned, collision-free S3 object key.
   * Format: resumes/YYYY/MM/uuid-sanitizedOriginalFilename.ext
   */
  generateObjectKey(originalFilename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const sanitizedName = originalFilename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");

    const uuid = crypto.randomUUID();
    return `resumes/${year}/${month}/${uuid}-${sanitizedName}`;
  }

  /**
   * Generates a time-limited presigned PUT URL allowing the browser
   * to upload a file directly to S3 securely.
   * 
   * @param fileName Candidate file name
   * @param mimeType Candidate file MIME type
   * @param fileSize Candidate file size in bytes
   * @param expiresInSeconds Expiration limit (default 300s / 5 minutes)
   */
  async generatePresignedUploadUrl(
    fileName: string,
    mimeType: string,
    fileSize: number,
    expiresInSeconds: number = 300
  ): Promise<PresignedUrlResult> {
    const validation = this.validateFile(fileName, fileSize, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error || "File validation failed.");
    }

    const objectKey = this.generateObjectKey(fileName);
    const objectUrl = `${this.bucketUrl}/${objectKey}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: mimeType,
      Metadata: {
        "original-filename": fileName,
        "uploaded-at": new Date().toISOString(),
      },
    });

    try {
      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      const expiration = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return {
        presignedUrl,
        objectKey,
        objectUrl,
        expiration,
        fileName,
        fileSize,
        mimeType,
      };
    } catch (error: any) {
      console.error("[S3Service Error] Failed to generate presigned upload URL:", error);
      throw new Error(`Failed to generate upload URL: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Fallback server-mediated file upload to S3.
   */
  async uploadResume(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<S3UploadResult> {
    const validation = this.validateFile(fileName, buffer.length, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error || "File validation failed.");
    }

    const key = this.generateObjectKey(fileName);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        "original-filename": fileName,
        "uploaded-at": new Date().toISOString(),
      },
    });

    try {
      await s3Client.send(command);
      const url = `${this.bucketUrl}/${key}`;

      return {
        key,
        url,
        fileName,
        fileSize: buffer.length,
        mimeType,
      };
    } catch (error: any) {
      console.error("[S3Service Error] Failed to upload resume to S3:", error);
      throw new Error(`S3 Upload failed: ${error.message || "Unknown S3 error"}`);
    }
  }

  /**
   * Deletes an object from S3 for cleanup/rollback.
   */
  async deleteResume(key: string): Promise<void> {
    if (!key) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`[S3Service Cleanup] Successfully deleted object: ${key}`);
    } catch (error) {
      console.error(`[S3Service Error] Failed to delete object key "${key}":`, error);
    }
  }
}

export const s3Service = new S3Service();
