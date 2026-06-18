"use client";

import { useEffect, useRef, useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { compressImage } from "../../utils/compressImage";
import type { BlogPost } from "../../firebase";

type EditorPost = Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "publishedAt">;

interface BlogEditorProps {
  initial?: BlogPost | null;
  onSave: (data: EditorPost & { id?: string }) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

function slugify(str: string) {
  let decoded = str;
  try {
    decoded = decodeURIComponent(str);
  } catch {}

  return decoded
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097F\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TOOLBAR_ACTIONS: { label: string; cmd: string; arg?: string; title: string }[] = [
  { label: "B", cmd: "bold", title: "Bold" },
  { label: "I", cmd: "italic", title: "Italic" },
  { label: "U", cmd: "underline", title: "Underline" },
  { label: "H1", cmd: "formatBlock", arg: "H1", title: "Heading 1" },
  { label: "H2", cmd: "formatBlock", arg: "H2", title: "Heading 2" },
  { label: "H3", cmd: "formatBlock", arg: "H3", title: "Heading 3" },
  { label: "¶", cmd: "formatBlock", arg: "P", title: "Paragraph" },
  { label: "• List", cmd: "insertUnorderedList", title: "Bullet list" },
  { label: "1. List", cmd: "insertOrderedList", title: "Numbered list" },
  { label: "❝", cmd: "formatBlock", arg: "BLOCKQUOTE", title: "Blockquote" },
  { label: "—", cmd: "insertHorizontalRule", title: "Divider" },
];

export function BlogEditor({ initial, onSave, onCancel, saving }: BlogEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "KrishiDukaan Team");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "");
  const [readTime, setReadTime] = useState<number>(initial?.readTime ?? 5);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [slugManual, setSlugManual] = useState(!!initial?.slug);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const cleanSlug = slugify(slug || title);
  const canSave = !!title.trim() && !!cleanSlug;

  const uploadToStorage = (file: File, path: string, onProgress: (p: number) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on("state_changed",
        snap => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  };

  const handleImageInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setImageUploadProgress(0);
    try {
      const toUpload = await compressImage(file);
      const path = `blog-images/${Date.now()}-${file.name}`;
      const url = await uploadToStorage(toUpload, path, setImageUploadProgress);
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, `<img src="${url}" alt="${file.name}" />`);
    } finally {
      setUploadingImage(false);
      setImageUploadProgress(0);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const toUpload = await compressImage(file);
      const path = `blog-covers/${Date.now()}-${file.name}`;
      const url = await uploadToStorage(toUpload, path, () => {});
      setCoverImage(url);
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (editorRef.current && initial?.content) {
      editorRef.current.innerHTML = initial.content;
    }
  }, []);

  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  const execCmd = (cmd: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
  };

  const openLinkDialog = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
    setLinkUrl("");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const insertLink = () => {
    if (!linkUrl) { setShowLinkInput(false); return; }
    const sel = window.getSelection();
    if (savedRange.current) {
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    editorRef.current?.focus();
    document.execCommand("createLink", false, linkUrl);
    setShowLinkInput(false);
    setLinkUrl("");
    savedRange.current = null;
  };

  const handleSave = async (overrideStatus?: "draft" | "published") => {
    const content = editorRef.current?.innerHTML ?? "";
    const tagArr = tags.split(",").map(t => t.trim()).filter(Boolean);
    const finalStatus = overrideStatus ?? status;
    if (overrideStatus) setStatus(overrideStatus);
    await onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      title,
      slug: cleanSlug,
      excerpt,
      author,
      content,
      tags: tagArr,
      coverImage,
      readTime,
      status: finalStatus,
    } as EditorPost & { id?: string });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-outline-variant/30 bg-surface-container-lowest shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ← Back
          </button>
          <span className="text-on-surface-variant/40 text-sm">|</span>
          <h2 className="font-black text-on-surface text-sm">
            {initial ? "Edit Post" : "New Blog Post"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={saving || !canSave}
            className="text-xs font-semibold border border-outline-variant text-on-surface-variant px-4 py-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && status === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("published")}
            disabled={saving || !canSave}
            className="text-xs font-bold bg-primary text-white px-5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && status === "published" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main editing area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white">
          {/* Title */}
          <div className="px-8 md:px-20 pt-10 pb-2">
            <textarea
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Post title…"
              rows={2}
              className="w-full resize-none text-3xl md:text-4xl font-black text-on-surface placeholder-on-surface-variant/40 border-none outline-none bg-transparent leading-tight"
            />
          </div>

          {/* Excerpt */}
          <div className="px-8 md:px-20 pb-4">
            <textarea
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              placeholder="Short excerpt / subtitle (shown in blog list)…"
              rows={2}
              className="w-full resize-none text-base text-on-surface-variant italic placeholder-on-surface-variant/30 border-none outline-none bg-transparent leading-relaxed"
            />
          </div>

          {/* Toolbar */}
          <div className="sticky top-0 z-10 px-6 md:px-16 py-2 bg-white/95 backdrop-blur-sm border-y border-surface-container flex flex-wrap items-center gap-1">
            {TOOLBAR_ACTIONS.map(({ label, cmd, arg, title }) => (
              <button
                key={label}
                type="button"
                title={title}
                onMouseDown={e => { e.preventDefault(); execCmd(cmd, arg); }}
                className="min-w-[32px] h-8 px-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-lg transition-colors"
              >
                {label}
              </button>
            ))}
            <div className="h-5 w-px bg-outline-variant/30 mx-1" />
            <button
              type="button"
              title="Insert Link"
              onMouseDown={e => { e.preventDefault(); openLinkDialog(); }}
              className="min-w-[32px] h-8 px-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-lg transition-colors"
            >
              🔗
            </button>
            <button
              type="button"
              title="Insert Image"
              disabled={uploadingImage}
              onMouseDown={e => { e.preventDefault(); imageInputRef.current?.click(); }}
              className="min-w-[32px] h-8 px-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-lg transition-colors disabled:opacity-50"
            >
              {uploadingImage ? `${imageUploadProgress}%` : "🖼"}
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInsert} />
            {showLinkInput && (
              <div className="flex items-center gap-1 ml-1">
                <input
                  ref={linkInputRef}
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } if (e.key === "Escape") setShowLinkInput(false); }}
                  className="text-xs border border-outline-variant rounded-lg px-2 py-1 w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); insertLink(); }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Insert
                </button>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setShowLinkInput(false); }}
                  className="text-xs text-on-surface-variant hover:text-on-surface"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Content editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Start writing your post here…"
            className="flex-1 min-h-[500px] px-8 md:px-20 py-8 text-on-surface leading-relaxed text-base outline-none blog-editor-content"
          />
        </div>

        {/* Right sidebar: metadata */}
        <aside className="w-64 xl:w-72 border-l border-outline-variant/30 bg-surface-container-lowest overflow-y-auto p-5 flex flex-col gap-5 shrink-0">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-1.5">Slug (URL)</label>
            <input
              type="text"
              value={slug}
              onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
              onBlur={() => setSlug(cleanSlug)}
              className="w-full text-xs border border-outline-variant rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              placeholder="post-url-slug"
            />
            <p className="text-[10px] text-on-surface-variant mt-1">/blog/{cleanSlug || "…"}</p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-1.5">Author</label>
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="w-full text-xs border border-outline-variant rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="farming, crop, agri"
              className="w-full text-xs border border-outline-variant rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-1.5">Cover Image</label>
            <button
              type="button"
              disabled={uploadingCover}
              onClick={() => coverInputRef.current?.click()}
              className="w-full text-xs font-bold border border-primary text-primary px-3 py-2 rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-50 mb-2"
            >
              {uploadingCover ? "Uploading…" : "⬆ Upload Cover Image"}
            </button>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            <input
              type="url"
              value={coverImage}
              onChange={e => setCoverImage(e.target.value)}
              placeholder="or paste image URL…"
              className="w-full text-xs border border-outline-variant rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {coverImage && (
              <img src={coverImage} alt="cover preview" className="mt-2 w-full h-24 object-cover rounded-lg" />
            )}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-1.5">Read Time (minutes)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={readTime}
              onChange={e => setReadTime(Number(e.target.value))}
              className="w-full text-xs border border-outline-variant rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </aside>
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 bg-white border-t border-outline-variant/40 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
            status === "published"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === "published" ? "bg-green-500" : "bg-amber-500"}`} />
            {status === "published" ? "Published" : "Draft"}
          </span>
          {!title && (
            <span className="text-xs text-on-surface-variant">— Enter a title to enable saving</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={saving || !canSave}
            className="text-sm font-semibold border border-outline-variant text-on-surface-variant px-4 py-2 rounded-lg hover:bg-surface-container hover:text-on-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && status === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("published")}
            disabled={saving || !canSave}
            className="text-sm font-bold bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && status === "published" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <style>{`
        .blog-editor-content:empty:before {
          content: attr(data-placeholder);
          color: #aaa;
          pointer-events: none;
        }
        .blog-editor-content h1 { font-size: 2rem; font-weight: 900; margin: 1.5rem 0 0.75rem; line-height: 1.2; }
        .blog-editor-content h2 { font-size: 1.5rem; font-weight: 800; margin: 1.5rem 0 0.75rem; line-height: 1.3; }
        .blog-editor-content h3 { font-size: 1.2rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
        .blog-editor-content p { margin-bottom: 1rem; }
        .blog-editor-content ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .blog-editor-content ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .blog-editor-content li { margin-bottom: 0.4rem; }
        .blog-editor-content blockquote { border-left: 4px solid #2e7d32; padding: 0.75rem 1rem; background: rgba(46,125,50,0.06); border-radius: 0 0.75rem 0.75rem 0; margin: 1.25rem 0; font-style: italic; }
        .blog-editor-content a { color: #2e7d32; text-decoration: underline; }
        .blog-editor-content img { max-width: 100%; border-radius: 1rem; margin: 1rem 0; }
        .blog-editor-content hr { border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; }
      `}</style>
    </div>
  );
}
