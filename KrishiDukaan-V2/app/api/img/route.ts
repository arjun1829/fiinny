import { NextRequest, NextResponse } from 'next/server';

// Image proxy for the Flutter **web** build.
//
// Flutter web (CanvasKit) requests cross-origin images with crossOrigin=anonymous,
// so any image host that doesn't send Access-Control-Allow-Origin fails to render
// (most product image hosts + Firebase Storage without CORS config). Native apps
// are unaffected. This route fetches the image server-side and re-serves it with
// permissive CORS so the web build can display it.
//
// Guards: only http/https, only image content-types, response capped.
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('Missing url', { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new NextResponse('Unsupported scheme', { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'KrishiDukan-ImageProxy/1.0' },
      // 10s safety timeout
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new NextResponse('Upstream error', { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return new NextResponse('Not an image', { status: 415 });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return new NextResponse('Image too large', { status: 413 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse('Fetch failed', { status: 502 });
  }
}
