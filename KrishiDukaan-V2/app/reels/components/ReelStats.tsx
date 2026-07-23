import { Eye, Heart } from "lucide-react";
import { formatCount } from "../lib/format";

interface Props {
  likesCount: number;
  viewsCount: number;
}

/**
 * Like and view counters down the right edge of a reel.
 *
 * Read-only on web. Liking requires an authenticated session that the public
 * SEO-rendered feed does not have, so these are presented as figures rather
 * than as buttons — showing a control that cannot work is worse than showing
 * none. The mobile feed has the interactive version.
 */
export default function ReelStats({ likesCount, viewsCount }: Props) {
  return (
    <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4 text-white">
      <span className="flex flex-col items-center text-xs font-semibold">
        <Heart className="mb-1 h-6 w-6" aria-hidden />
        {formatCount(likesCount)}
        <span className="sr-only">likes</span>
      </span>
      <span className="flex flex-col items-center text-xs font-semibold">
        <Eye className="mb-1 h-6 w-6" aria-hidden />
        {formatCount(viewsCount)}
        <span className="sr-only">views</span>
      </span>
    </div>
  );
}
