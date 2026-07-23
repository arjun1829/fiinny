import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import type { FeedReel } from "../lib/types";

interface Props {
  reel: FeedReel;
}

/**
 * Shop handle, title, caption and the linked-product call to action.
 *
 * The product chip is the commercial point of the whole feature — it is the
 * only path from watching a reel to buying what is in it — so it stays visually
 * prominent and is a real link (crawlable, middle-clickable) rather than a
 * click handler.
 */
export default function ReelInfo({ reel }: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-5 text-white">
      <p className="text-sm font-black">@{reel.shopName}</p>

      {reel.title ? (
        <Link
          href={`/reels/${reel.slug}`}
          className="mt-1 block text-base font-bold leading-snug hover:underline"
        >
          {reel.title}
        </Link>
      ) : null}

      {reel.caption ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-white/85">{reel.caption}</p>
      ) : null}

      {reel.productPath ? (
        <Link
          href={reel.productPath}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur-sm transition-colors hover:bg-white/25"
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
          <span className="max-w-[220px] truncate">
            {reel.linkedProductName || "View Product"}
          </span>
          <span aria-hidden>›</span>
        </Link>
      ) : null}
    </div>
  );
}
