import { MetadataRoute } from 'next';
import { BlogService } from '@/lib/blog-service';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://fiinny.com'; // Replace with actual domain

    // 1. Static Routes
    const routes = [
        '',
        '/blog',
        '/login',
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: route === '' ? 1 : 0.8,
    }));

    // 2. Dynamic Blog Posts
    let blogRoutes: MetadataRoute.Sitemap = [];
    try {
        const posts = await BlogService.getPosts();
        blogRoutes = posts.map((post) => ({
            url: `${baseUrl}/blog/${post.slug}`,
            lastModified: new Date(post.date), // Assuming date is parseable or use 'updatedAt' field if available
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        }));
    } catch (error) {
        console.error("Sitemap generation failed to fetch posts:", error);
    }

    return [...routes, ...blogRoutes];
}
