import { NextRequest, NextResponse } from "next/server";
import { resumeService } from "@/features/application/services";

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

/**
 * GET /api/applications/[id]/resume
 * 
 * Generates a time-limited secure presigned GET download URL for an application's resume.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Application ID is required.",
          error: { code: "MISSING_APPLICATION_ID" },
        },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const expiresParam = searchParams.get("expiresIn");
    const expiresInSeconds = expiresParam ? parseInt(expiresParam, 10) : 900;

    const result = await resumeService.getResumeDownloadUrl(id, expiresInSeconds);

    if (!result.success) {
      const status = result.message.includes("not found") ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          error: result.error || { code: "GET_RESUME_URL_FAILED" },
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API Error] GET /api/applications/[id]/resume failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error while fetching resume download URL.",
        error: { code: "INTERNAL_SERVER_ERROR", details: error.message },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/applications/[id]/resume
 * 
 * Atomically replaces an existing application resume with new S3 metadata,
 * deleting the old S3 object if present.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Application ID is required.",
          error: { code: "MISSING_APPLICATION_ID" },
        },
        { status: 400 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON payload provided.",
          error: { code: "INVALID_JSON_BODY" },
        },
        { status: 400 }
      );
    }

    const { resumeUrl, resumeKey, fileName, fileSize, mimeType } = body;

    if (!resumeKey || !fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required resume fields (resumeKey, fileName, fileSize, mimeType).",
          error: { code: "INVALID_REPLACEMENT_PAYLOAD" },
        },
        { status: 400 }
      );
    }

    const result = await resumeService.replaceResume(id, {
      resumeUrl: resumeUrl || `https://${process.env.AWS_BUCKET_NAME || "mercor-clone-resumes"}.s3.amazonaws.com/${resumeKey}`,
      resumeKey,
      fileName,
      fileSize,
      mimeType,
    });

    if (!result.success) {
      const status = result.message.includes("not found") ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          error: result.error || { code: "REPLACE_RESUME_FAILED" },
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API Error] PUT /api/applications/[id]/resume failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error while replacing resume.",
        error: { code: "INTERNAL_SERVER_ERROR", details: error.message },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/applications/[id]/resume
 * 
 * Clears resume metadata from application record in database and deletes S3 object.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Application ID is required.",
          error: { code: "MISSING_APPLICATION_ID" },
        },
        { status: 400 }
      );
    }

    const result = await resumeService.deleteResume(id);

    if (!result.success) {
      const status = result.message.includes("not found") ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          error: result.error || { code: "DELETE_RESUME_FAILED" },
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API Error] DELETE /api/applications/[id]/resume failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error while deleting resume.",
        error: { code: "INTERNAL_SERVER_ERROR", details: error.message },
      },
      { status: 500 }
    );
  }
}
