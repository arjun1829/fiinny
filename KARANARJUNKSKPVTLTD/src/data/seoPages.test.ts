import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESOURCES_PATH, SEO_ROUTES } from './seoRoutes';
import { SEO_CONTENT } from './seoContent';

// Keeps the search-landing pages, their content, the sitemap and the internal
// links in step. A page that is routed but missing from the sitemap, or a
// "related" link to a page that does not exist, is an SEO bug nobody notices.

const sitemap = readFileSync(resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
const robots = readFileSync(resolve(__dirname, '../../public/robots.txt'), 'utf8');
const paths = new Set(SEO_ROUTES.map(r => r.path));

describe('search-landing pages', () => {
    it('every route has content, and every content entry has a route', () => {
        for (const r of SEO_ROUTES) expect(SEO_CONTENT[r.path], r.path).toBeDefined();
        for (const p of Object.keys(SEO_CONTENT)) expect(paths.has(p), p).toBe(true);
    });

    it('every route and the hub are in the sitemap', () => {
        for (const p of [RESOURCES_PATH, ...paths]) {
            expect(sitemap, p).toContain(`<loc>https://karanarjunerp.com${p}</loc>`);
        }
    });

    it('no route is blocked in robots.txt', () => {
        const disallowed = robots.split('\n').filter(l => l.startsWith('Disallow:')).map(l => l.replace('Disallow:', '').trim());
        for (const p of paths) {
            expect(disallowed.some(d => d && p.startsWith(d)), p).toBe(false);
        }
    });

    it('titles and descriptions are unique and a sensible length', () => {
        const titles = SEO_ROUTES.map(r => r.title);
        const descs = SEO_ROUTES.map(r => r.description);
        expect(new Set(titles).size).toBe(titles.length);
        expect(new Set(descs).size).toBe(descs.length);
        for (const r of SEO_ROUTES) {
            expect(r.description.length, r.path).toBeGreaterThan(70);
            expect(r.description.length, r.path).toBeLessThanOrEqual(200);
        }
    });

    it('related links and language alternates point at real pages, both ways', () => {
        for (const r of SEO_ROUTES) {
            for (const rel of SEO_CONTENT[r.path].related) expect(paths.has(rel), `${r.path} → ${rel}`).toBe(true);
            for (const [, alt] of Object.entries(r.alternates ?? {})) {
                expect(paths.has(alt), `${r.path} ↔ ${alt}`).toBe(true);
                const back = SEO_ROUTES.find(x => x.path === alt)!;
                expect(Object.values(back.alternates ?? {}), `${alt} should link back to ${r.path}`).toContain(r.path);
            }
        }
    });

    it('every page has at least two FAQs and two sections', () => {
        for (const [p, c] of Object.entries(SEO_CONTENT)) {
            expect(c.faqs.length, p).toBeGreaterThanOrEqual(2);
            expect(c.sections.length, p).toBeGreaterThanOrEqual(2);
        }
    });
});
