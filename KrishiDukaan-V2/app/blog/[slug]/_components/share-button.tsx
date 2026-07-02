"use client";

/**
 * WhatsApp share button — the only interactive part of the blog post page.
 * Isolated as a client component so the page itself can be a server component.
 * Behaviour is identical to the previous inline implementation.
 */
export default function ShareButton({ title }: { title: string }) {
  const href =
    typeof window !== "undefined"
      ? `https://wa.me/?text=${encodeURIComponent(`${title} — ${window.location.href}`)}`
      : `https://wa.me/?text=${encodeURIComponent(title)}`;

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
