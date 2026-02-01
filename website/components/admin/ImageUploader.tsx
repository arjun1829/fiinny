"use client";

import React, { useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { BlogService } from '@/lib/blog-service';

interface ImageUploaderProps {
    value?: string;
    onChange: (url: string) => void;
    label?: string;
}

export default function ImageUploader({ value, onChange, label = "Upload Image" }: ImageUploaderProps) {
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            setUploading(true);
            try {
                const file = e.target.files[0];
                const url = await BlogService.uploadImage(file);
                onChange(url);
            } catch (error) {
                console.error("Upload failed", error);
                alert("Upload failed, please try again.");
            } finally {
                setUploading(false);
            }
        }
    };

    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>

            {value ? (
                <div className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value} alt="Preview" className="w-full h-full object-cover" />
                    <button
                        onClick={() => onChange("")}
                        className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-slate-700 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        type="button"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                </div>
            ) : (
                <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 transition-colors text-center cursor-pointer">
                    <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleUpload}
                        disabled={uploading}
                    />
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                        {uploading ? (
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                        ) : (
                            <>
                                <div className="p-3 bg-teal-50 text-teal-600 rounded-full">
                                    <Upload className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="font-semibold text-teal-600">Click to upload</span> or drag and drop
                                </div>
                                <p className="text-xs text-slate-400">SVG, PNG, JPG or GIF</p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
