import { S3Client } from "@aws-sdk/client-s3";

/**
 * AWS S3 Client Initialization Module
 * 
 * Responsibility:
 * Centralized AWS S3 client singleton configuration.
 * All S3 interactions across the application MUST consume this exported client.
 */

const region = process.env.AWS_REGION || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";

/**
 * Reusable S3 Client Singleton instance.
 * Server-only module using AWS SDK v3.
 */
export const s3Client = new S3Client({
  region,
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : undefined,
});
