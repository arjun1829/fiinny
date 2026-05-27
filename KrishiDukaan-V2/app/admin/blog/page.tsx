"use client";

import { useEffect, useState } from "react";
import { PenLine, Trash2, Plus, Eye } from "lucide-react";
import {
  fetchBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  type BlogPost,
} from "../../firebase";
import { BlogEditor } from "../_components/blog-editor";

type EditorPost = Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "publishedAt">;

const SEED_POSTS: Omit<BlogPost, "id">[] = [
  {
    title: "How to Choose the Right Fertilizer for Your Crops",
    slug: "how-to-choose-right-fertilizer-for-crops",
    excerpt: "Understand NPK ratios, soil testing, and how to match fertilizer type to your specific crop and soil conditions.",
    content: `<h2>Why Fertilizer Choice Matters</h2><p>Choosing the wrong fertilizer wastes money and can damage your soil. In India, where smallholder farmers manage thin margins, getting this right is critical.</p><h2>Understanding NPK</h2><p>Every fertilizer bag lists three numbers — Nitrogen (N), Phosphorus (P), and Potassium (K). For example, <strong>10-26-26</strong> means 10% N, 26% P, and 26% K.</p><ul><li><strong>Nitrogen (N)</strong> — drives leafy, vegetative growth. Good for wheat, paddy, and leafy vegetables.</li><li><strong>Phosphorus (P)</strong> — supports root development and flowering. Critical at the seedling stage.</li><li><strong>Potassium (K)</strong> — improves drought resistance and fruit quality. Essential for tomatoes, grapes, and sugarcane.</li></ul><h2>Soil Testing First</h2><p>Before buying anything, get your soil tested at a nearby <strong>Krishi Vigyan Kendra (KVK)</strong> or through state agriculture department labs. A proper soil health card costs very little and can save thousands.</p><h2>Organic vs Chemical Fertilizers</h2><p>Organic fertilizers (compost, vermicompost, farmyard manure) improve soil structure over time. Chemical fertilizers give quick results but need careful dosing. A balanced approach — starting organic, topping up with chemical where needed — usually works best.</p><blockquote>Always follow the recommended dose. Over-fertilizing is one of the most common and costly mistakes Indian farmers make.</blockquote><h2>Where to Buy</h2><p>Verified fertilizer retailers near you are listed on KrishiDukaan. Always check that the retailer is licensed (fertilizer sale requires a state licence under the Fertilizer Control Order).</p>`,
    tags: ["fertilizer", "soil", "farming tips"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "",
    readTime: 5,
  },
  {
    title: "Kharif vs Rabi: Seasonal Crop Planning Guide for Indian Farmers",
    slug: "kharif-vs-rabi-seasonal-crop-planning-guide",
    excerpt: "A practical guide to planning your crop calendar around India's two main farming seasons — with crop suggestions by region.",
    content: `<h2>India's Two Main Farming Seasons</h2><p>Indian agriculture runs on two major seasons — <strong>Kharif</strong> (monsoon) and <strong>Rabi</strong> (winter). Understanding the difference is the foundation of good crop planning.</p><h2>Kharif Season (June – November)</h2><p>Kharif crops are sown at the start of the southwest monsoon and harvested in autumn.</p><ul><li>Rice (Paddy)</li><li>Maize (Corn)</li><li>Cotton</li><li>Soybean</li><li>Groundnut</li><li>Jowar and Bajra</li></ul><p>These crops need warm weather and heavy rainfall. States like Maharashtra, Andhra Pradesh, and Punjab rely heavily on kharif for their income.</p><h2>Rabi Season (November – April)</h2><p>Rabi crops are sown after the monsoon retreats and harvested in spring. They depend on residual moisture and irrigation.</p><ul><li>Wheat</li><li>Mustard</li><li>Chickpea (Chana)</li><li>Peas</li><li>Barley</li></ul><h2>Zaid (Summer Crops)</h2><p>A short season between March and June, suitable for watermelons, cucumbers, bitter gourd, and other vegetables where irrigation is available.</p><h2>How to Plan Your Crop Calendar</h2><p>1. Know your local last frost date and average rainfall pattern.<br>2. Check the Minimum Support Price (MSP) announced by the government for the upcoming season.<br>3. Diversify — don't plant the same crop on every plot. Rotate to maintain soil health.<br>4. Talk to your local agricultural officer or use the crop advisory services on KrishiDukaan.</p><blockquote>Diversification is your best protection against price crashes and weather shocks.</blockquote>`,
    tags: ["crop planning", "kharif", "rabi", "seasons"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "",
    readTime: 6,
  },
  {
    title: "5 Signs Your Crop Has a Pest Problem — and What to Do",
    slug: "5-signs-crop-pest-problem-and-what-to-do",
    excerpt: "Early pest detection saves yields. Learn to spot the most common warning signs before damage becomes irreversible.",
    content: `<h2>Why Early Detection Matters</h2><p>Pest damage can wipe out 20–40% of a crop if not caught early. The challenge is that most farmers only notice a problem once it's already spread. Here are five early warning signs every farmer should know.</p><h2>1. Irregular Leaf Holes or Chewing Marks</h2><p>Caterpillars (like armyworm or bollworm) chew irregular holes in leaves. If you see ragged edges or large sections eaten out, check the undersides of leaves for eggs or larvae. Act within 2–3 days.</p><h2>2. Yellowing Leaves (Chlorosis)</h2><p>Not all yellowing is a pest sign — it can also indicate nitrogen deficiency. But if yellowing appears in patches and is accompanied by sticky residue (honeydew), it's likely <strong>aphids or whiteflies</strong>. Check with a hand lens.</p><h2>3. Wilting Despite Adequate Water</h2><p>If plants wilt even when the soil is moist, suspect <strong>root-feeding grubs</strong> or a stem borer. Pull out a wilting plant gently — if the root system is damaged or there are grub tunnels in the stem, you have a soil pest.</p><h2>4. Gummy or Sticky Deposits on Stems</h2><p>Mealy bugs and scale insects excrete a sugary substance that attracts ants and black sooty mold. If you see black patches on stems or a sticky feel, inspect closely for tiny white or brown insects.</p><h2>5. Deformed or Curled Leaves</h2><p>Mites and thrips cause leaf curling and silvery streaking. They're tiny but very damaging. Hot, dry conditions favor mite outbreaks.</p><h2>What to Do</h2><ol><li>Identify the pest correctly before spraying anything — wrong pesticide wastes money and increases resistance.</li><li>Use <strong>Integrated Pest Management (IPM)</strong>: start with sticky traps, neem oil, or biocontrol agents before chemical pesticides.</li><li>Consult a verified agri-input retailer on KrishiDukaan for the right product recommendation.</li><li>Always follow the label dose and pre-harvest interval.</li></ol><blockquote>When in doubt, take a photo and share it with your KVK or a trusted agronomist before spending on pesticides.</blockquote>`,
    tags: ["pest control", "crop health", "farming tips"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "",
    readTime: 7,
  },
];

function formatDate(ts: unknown): string {
  try {
    const d = (ts as any)?.toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlogPost | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSeedPosts = async () => {
    setSeeding(true);
    try {
      await Promise.all(SEED_POSTS.map(p => createBlogPost(p)));
      showToast("3 sample posts created!");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Seed failed", "error");
    } finally {
      setSeeding(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const all = await fetchBlogPosts("all");
      setPosts(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data: EditorPost & { id?: string }) => {
    setSaving(true);
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await updateBlogPost(id, rest);
        showToast("Post updated successfully");
      } else {
        const { id: _id, ...rest } = data;
        await createBlogPost(rest as Omit<BlogPost, "id">);
        showToast("Post created successfully");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Failed to save post", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBlogPost(id);
      showToast("Post deleted");
      setDeleteConfirm(null);
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Failed to delete", "error");
    }
  };

  if (editing !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <BlogEditor
          initial={editing === "new" ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-on-surface">Blog Posts</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{posts.length} total · {posts.filter(p => p.status === "published").length} published</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Post
        </button>
      </div>

      {/* Posts list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          <div className="text-5xl mb-4">📝</div>
          <p className="font-bold text-lg">No blog posts yet</p>
          <p className="text-sm mt-1">Create your first post to get started.</p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 bg-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Create First Post
            </button>
            <button
              type="button"
              onClick={handleSeedPosts}
              disabled={seeding}
              className="inline-flex items-center gap-2 border border-primary text-primary text-sm font-black px-5 py-2.5 rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              {seeding ? "Seeding…" : "Seed Sample Posts"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map(post => (
            <div
              key={post.id}
              className="flex items-start gap-4 bg-white rounded-2xl border border-surface-container p-4 hover:shadow-sm transition-shadow"
            >
              {post.coverImage ? (
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-20 h-14 object-cover rounded-xl shrink-0"
                />
              ) : (
                <div className="w-20 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-2xl">🌿</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${post.status === "published" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {post.status === "published" ? "Published" : "Draft"}
                  </span>
                  {(post.tags || []).slice(0, 2).map(t => (
                    <span key={t} className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
                <h3 className="font-black text-on-surface text-base leading-snug mb-0.5 line-clamp-1">{post.title}</h3>
                <p className="text-sm text-on-surface-variant line-clamp-1">{post.excerpt}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-on-surface-variant font-semibold uppercase tracking-wide">
                  <span>By {post.author}</span>
                  <span>·</span>
                  <span>{formatDate(post.status === "published" ? post.publishedAt : post.createdAt)}</span>
                  {post.readTime && <><span>·</span><span>{post.readTime} min read</span></>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {post.status === "published" && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                    title="View post"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(post)}
                  className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                  title="Edit post"
                >
                  <PenLine className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(post.id)}
                  className="p-2 rounded-xl text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Delete post"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4">
            <h3 className="font-black text-on-surface text-lg mb-2">Delete Post?</h3>
            <p className="text-sm text-on-surface-variant mb-5">This action cannot be undone. The post will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-outline-variant text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
