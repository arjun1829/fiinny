"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BlogPostForm from '@/components/admin/BlogPostForm';
import { BlogService, BlogPost } from '@/lib/blog-service';

interface EditPostClientProps {
    id: string;
}

export default function EditPostClient({ id }: EditPostClientProps) {
    const router = useRouter();
    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            loadPost(id);
        }
    }, [id]);

    const loadPost = async (postId: string) => {
        setLoading(true);
        const data = await BlogService.getPostById(postId);
        if (!data) {
            alert("Post not found");
            router.push('/admin/blog');
            return;
        }
        setPost(data);
        setLoading(false);
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
    }

    if (!post) return null;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 px-6 py-8">
            <BlogPostForm pageTitle="Edit Post" initialData={post} />
        </div>
    );
}
