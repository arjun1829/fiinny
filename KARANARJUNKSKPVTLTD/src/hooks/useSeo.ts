import { useEffect } from 'react';

/**
 * Structured data (JSON-LD) for one public page, removed again when the page
 * unmounts. Titles, descriptions, canonical and robots tags are owned by
 * components/RouteSeo.tsx (one table for every public path) — do not set them
 * here, or the two would fight over document.title.
 */
export function usePageJsonLd(path: string, jsonLd: object[]) {
    useEffect(() => {
        const scripts = jsonLd.map(obj => {
            const s = document.createElement('script');
            s.type = 'application/ld+json';
            s.dataset.page = path;
            s.text = JSON.stringify(obj);
            document.head.appendChild(s);
            return s;
        });
        return () => scripts.forEach(s => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path]);
}
