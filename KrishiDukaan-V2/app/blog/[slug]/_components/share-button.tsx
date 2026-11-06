/**
 * WhatsApp share button. The URL is the post's canonical absolute URL, built on
 * the server from the post slug and NEXT_PUBLIC_SITE_URL, so the link is
 * identical in server-rendered/ISR HTML and after hydration (no window.location,
 * which is unavailable at render time and never resolved to the post URL).
 * The shared link's preview (image/title/description) comes from the page's
 * Open Graph tags in generateMetadata.
 */
export default function ShareButton({ title, url }: { title: string; url: string }) {
  // Non-ASCII slugs (e.g. Marathi/Hindi) arrive percent-encoded, which is right
  // for canonical/OG tags but unreadable in a chat message. Show the readable
  // form; WhatsApp links it and encodes it itself when the link is opened.
  let readableUrl = url;
  try {
    readableUrl = decodeURI(url);
  } catch {
    /* malformed escape — keep the encoded URL */
  }
  const href = `https://wa.me/?text=${encodeURIComponent(`*${title}*\n${readableUrl}`)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs font-bold bg-green-600 text-white px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
    >
      Share on WhatsApp
    </a>
  );
}
