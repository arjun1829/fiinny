"use client";

import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import {
    Bold, Italic, Strikethrough, Code, Heading1, Heading2,
    List, ListOrdered, Quote, Undo, Redo, Link as LinkIcon,
    Image as ImageIcon, Youtube as YoutubeIcon
} from 'lucide-react';
import { BlogService } from '@/lib/blog-service';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
}

const MenuButton = ({
    onClick,
    isActive = false,
    children,
    title
}: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title?: string;
}) => (
    <button
        onClick={onClick}
        className={`p-2 rounded hover:bg-slate-100 transition-colors ${isActive ? 'text-teal-600 bg-teal-50' : 'text-slate-500'
            }`}
        title={title}
        type="button"
    >
        {children}
    </button>
);

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-teal-600 underline cursor-pointer',
                },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: 'rounded-lg max-w-full my-4',
                },
            }),
            Youtube.configure({
                controls: false,
                HTMLAttributes: {
                    class: 'rounded-lg max-w-full my-4 aspect-video',
                },
            }),
        ],
        content: content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-slate max-w-none focus:outline-none min-h-[300px] px-4 py-4',
            },
        },
    });

    const addImage = useCallback(async () => {
        const url = window.prompt('Enter image URL or leave empty to upload');

        if (url) {
            editor?.chain().focus().setImage({ src: url }).run();
            return;
        }

        // Create file input for upload
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            if (input.files?.length) {
                const file = input.files[0];
                try {
                    // Show some loading state if possible
                    const downloadUrl = await BlogService.uploadImage(file);
                    editor?.chain().focus().setImage({ src: downloadUrl }).run();
                } catch (error) {
                    alert('Failed to upload image');
                    console.error(error);
                }
            }
        };
        input.click();
    }, [editor]);

    const addYoutube = useCallback(() => {
        const url = prompt('Enter YouTube URL');
        if (url) {
            editor?.chain().focus().setYoutubeVideo({ src: url }).run();
        }
    }, [editor]);

    const setLink = useCallback(() => {
        const previousUrl = editor?.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl);

        if (url === null) {
            return;
        }

        if (url === '') {
            editor?.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 p-2 flex flex-wrap gap-1">
                <MenuButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold"
                >
                    <Bold className="w-4 h-4" />
                </MenuButton>
                <MenuButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic"
                >
                    <Italic className="w-4 h-4" />
                </MenuButton>
                <MenuButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <Strikethrough className="w-4 h-4" />
                </MenuButton>

                <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

                <MenuButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    title="Heading 1"
                >
                    <Heading1 className="w-4 h-4" />
                </MenuButton>
                <MenuButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    title="Heading 2"
                >
                    <Heading2 className="w-4 h-4" />
                </MenuButton>

                <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

                <MenuButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </MenuButton>
                <MenuButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Ordered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </MenuButton>
                <MenuButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote className="w-4 h-4" />
                </MenuButton>

                <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

                <MenuButton onClick={setLink} isActive={editor.isActive('link')} title="Link">
                    <LinkIcon className="w-4 h-4" />
                </MenuButton>
                <MenuButton onClick={addImage} title="Image">
                    <ImageIcon className="w-4 h-4" />
                </MenuButton>
                <MenuButton onClick={addYoutube} title="YouTube Video">
                    <YoutubeIcon className="w-4 h-4" />
                </MenuButton>

                <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

                <MenuButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
                    <Undo className="w-4 h-4" />
                </MenuButton>
                <MenuButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
                    <Redo className="w-4 h-4" />
                </MenuButton>
            </div>

            <EditorContent editor={editor} />
        </div>
    );
}
