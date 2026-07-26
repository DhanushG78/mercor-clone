import { NextRequest, NextResponse } from "next/server";
import { s3Service } from "@/features/application/services/s3.service";

/**
 * Next.js API Route Handler: POST /api/upload-resume
 * 
 * Responsibility:
 * Server-side endpoint to handle multipart/form-data resume file uploads to Amazon S3.
 * Enforces file size and type constraints, delegates upload logic to S3Service,
 * and returns S3 object metadata.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = (formData.get("file") || formData.get("resume")) as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          message: "No resume file provided in upload request.",
        },
        { status: 400 }
      );
    }

    const validation = s3Service.validateFile(
      file.name,
      file.size,
      file.type || "application/pdf"
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error || "File validation failed.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await s3Service.uploadResume(
      buffer,
      file.name,
      file.type || "application/pdf"
    );

    return NextResponse.json(
      {
        success: true,
        message: "Resume file uploaded to S3 successfully.",
        data: uploadResult,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API ROUTE ERROR] POST /api/upload-resume failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to upload resume to S3.",
      },
      { status: 500 }
    );
  }
}
