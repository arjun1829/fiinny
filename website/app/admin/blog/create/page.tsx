"use client";

import React from 'react';
import BlogPostForm from '@/components/admin/BlogPostForm';

export default function CreateBlogPostPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 px-6 py-8">
            <BlogPostForm pageTitle="Create New Post" />
        </div>
    );
}
