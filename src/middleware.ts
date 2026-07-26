import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Personalize from '@contentstack/personalize-edge-sdk';

const staticAssetExtensions = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.json',
  '.txt',
  '.map'
];

function shouldBypassPersonalization(url: URL) {
  const pathname = url.pathname;
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/static/') ||
    staticAssetExtensions.some((ext) => pathname.endsWith(ext))
  );
}

/**
 * Next.js Edge Middleware for Vercel deployment.
 * Runs on Vercel Edge Network to initialize Contentstack Personalize SDK,
 * compute visitor variant parameters, and attach cookies & state.
 */
export async function middleware(request: NextRequest) {
  const projectUid = process.env.NEXT_PUBLIC_CONTENTSTACK_PERSONALIZE_PROJECT_UID;

  if (!projectUid) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();

  if (shouldBypassPersonalization(url)) {
    return NextResponse.next();
  }

  try {
    const edgeApiUrl = process.env.NEXT_PUBLIC_CONTENTSTACK_PERSONALIZE_EDGE_API_URL || undefined;

    const personalizeSdk = await Personalize.init(projectUid, {
      request,
      edgeApiUrl,
    });

    const variantParam = personalizeSdk.getVariantParam();

    if (variantParam) {
      url.searchParams.set('variants', variantParam);
    }

    const response = NextResponse.rewrite(url);
    return personalizeSdk.addStateToResponse(response, request);
  } catch (error) {
    console.error('Contentstack Personalize Edge Middleware failed:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files & Next.js internals
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
