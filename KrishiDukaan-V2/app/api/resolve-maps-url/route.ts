import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const finalUrl = res.url;

    // Pattern 1: /maps/place/.../@lat,lng,zoom  or  /maps/.../@lat,lng
    const atMatch = finalUrl.match(/@(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/);
    if (atMatch) {
      return NextResponse.json({ lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) });
    }

    // Pattern 2: /maps/search/lat,+lng  (short URL → search redirect)
    const searchMatch = finalUrl.match(/\/search\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/);
    if (searchMatch) {
      return NextResponse.json({ lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) });
    }

    // Pattern 3: ?q=lat,lng  or  &q=lat,lng
    const qMatch = finalUrl.match(/[?&]q=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/);
    if (qMatch) {
      return NextResponse.json({ lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) });
    }

    return NextResponse.json({ error: 'No coordinates found in expanded URL' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Failed to resolve URL' }, { status: 500 });
  }
}
