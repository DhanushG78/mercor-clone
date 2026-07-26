import { NextRequest, NextResponse } from "next/server";
import { s3Service } from "@/features/application/services/s3.service";

/**
 * Next.js API Route Handler: POST /api/uploads/presigned-url
 * 
 * Responsibility:
 * Server-side endpoint to issue short-lived S3 presigned PUT URLs.
 * Receives file metadata only (filename, mimeType, fileSize) without receiving binary content.
 * Enforces file format and size limits, returning presigned upload parameters.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const fileName = body.fileName || body.filename;
    const { mimeType, fileSize } = body;

    if (!fileName || !mimeType || !fileSize) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required parameters (fileName, mimeType, fileSize).",
        },
        { status: 400 }
      );
    }

    const validation = s3Service.validateFile(fileName, Number(fileSize), mimeType);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error || "File validation failed.",
        },
        { status: 400 }
      );
    }

    const presignedData = await s3Service.generatePresignedUploadUrl(
      fileName,
      mimeType,
      Number(fileSize),
      300 // 5-minute expiration
    );

    return NextResponse.json(
      {
        success: true,
        message: "Presigned upload URL generated successfully.",
        data: presignedData,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API ROUTE ERROR] POST /api/uploads/presigned-url failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to generate presigned upload URL.",
      },
      { status: 500 }
    );
  }
}
