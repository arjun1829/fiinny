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
    title: "Why KrishiDukaan? India's First Hyperlocal Agri-Marketplace Explained",
    slug: "why-krishidukan-indias-first-hyperlocal-agri-marketplace",
    excerpt: "Millions of Indian farmers still travel hours to buy seeds and fertilizers. KrishiDukaan is changing that — connecting farmers with verified local retailers, real-time stock, and online delivery, all in one app.",
    content: `<h2>The Problem Every Indian Farmer Knows</h2><p>Picture this: a farmer in rural Maharashtra wakes up at 4 AM, rides his two-wheeler 40 km to the nearest agri-input shop, only to find that the fertilizer he needs is out of stock. He returns empty-handed, losing a day of work and money on fuel. This happens to <strong>millions of Indian farmers every season</strong>.</p><p>India has 146 million farming households. Yet most of them still rely on word-of-mouth to find where to buy seeds, fertilizers, or pesticides. There's no reliable way to know which shop has what in stock, at what price, and how far it is.</p><h2>What KrishiDukaan Does Differently</h2><p>KrishiDukaan is built around one idea: <strong>every farmer deserves access to verified agri-inputs, at fair prices, from a trusted local source — without wasting a day traveling.</strong></p><ul><li><strong>Hyperlocal store listing</strong> — See agri-retail shops sorted by distance from your location. Know exactly who is 2 km away vs 20 km away before you leave home.</li><li><strong>Verified retailers and manufacturers</strong> — Every seller on the platform goes through a registration and verification process. No anonymous vendors, no fake products.</li><li><strong>Real product listings with stock data</strong> — Each product shows which nearby stores carry it, at what price, and whether it's in stock today.</li><li><strong>Online ordering from local stores</strong> — When a retailer enables online delivery, farmers can place orders directly from the app and get delivery to their doorstep.</li><li><strong>Multi-language support</strong> — KrishiDukaan works in English, Marathi, and Hindi — because farmers shouldn't need to speak English to use technology.</li></ul><h2>For Retailers and Manufacturers</h2><p>KrishiDukaan isn't just for buyers. For agri-retailers and manufacturers, it's a digital storefront without the cost of building one.</p><ul><li>Create a free business profile and get discovered by farmers within 10–50 km</li><li>List your products and update stock levels from your phone</li><li>Accept online orders and manage delivery from your dashboard</li><li>Connect directly with manufacturers to expand your product range</li></ul><blockquote>We built KrishiDukaan because we believe Indian agriculture deserves the same technology that transformed urban retail. The farmer who grows our food shouldn't be the last one to benefit from the digital economy.</blockquote><h2>Who Should Use KrishiDukaan?</h2><p>If you are a <strong>farmer</strong> — use KrishiDukaan to find local suppliers, compare prices, and order online without traveling.</p><p>If you are an <strong>agri-retailer</strong> — use it to get a digital presence, attract new customers, and manage your inventory online.</p><p>If you are an <strong>agri-input manufacturer</strong> — use it to build your brand page, connect with retailers, and reach end farmers directly.</p><h2>Getting Started</h2><p>Visit <strong>krishidukan.com</strong>, allow location access, and instantly see agri stores and products near you. No login required to browse. Registration takes under 2 minutes.</p>`,
    tags: ["krishidukan", "about us", "agri marketplace", "farmers"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80",
    readTime: 6,
  },
  {
    title: "How to Buy Fertilizers Online Safely: A Guide for Indian Farmers",
    slug: "how-to-buy-fertilizers-online-safely-indian-farmers",
    excerpt: "Online agri-input buying is growing fast in India — but so are fake products. Here's how to buy fertilizers, pesticides, and seeds online safely and get genuine products every time.",
    content: `<h2>Online Agri-Shopping Is Growing Fast — But So Are the Risks</h2><p>India's agricultural input market is worth over ₹2 lakh crore annually. As digital penetration grows in rural areas, more farmers are trying to buy fertilizers, seeds, and pesticides online. The convenience is real — but so are the risks of counterfeit products and unreliable suppliers.</p><h2>Why Counterfeit Agri-Inputs Are a Serious Problem</h2><p>The All India Crop Protection Association estimates that <strong>30–40% of pesticides sold in India may be substandard or fake</strong>. Counterfeit fertilizers deliver no nutrition to the soil; fake pesticides harm crops or fail to control pests.</p><p>Signs your agri-input may be counterfeit:</p><ul><li>Price is significantly lower than the MRP on the package</li><li>No valid batch number or manufacturing date</li><li>Label is blurry, spelling errors, or missing regulatory information</li><li>Seller is unregistered or has no physical address</li><li>Product has no company helpline number</li></ul><h2>5 Rules for Safe Online Agri-Input Buying</h2><h3>1. Only Buy from Verified, Registered Sellers</h3><p>In India, fertilizer dealers require a licence under the <strong>Fertilizer Control Order (FCO)</strong>. Pesticide dealers require a licence under the <strong>Insecticides Act</strong>. On KrishiDukaan, all listed retailers are registered and verified before they can list products.</p><h3>2. Check for a Physical Address and Phone Number</h3><p>Any legitimate agri-input seller has a physical shop. If a seller only has an email or WhatsApp number, that's a red flag.</p><h3>3. Compare Prices — But Be Suspicious of Deep Discounts</h3><p>Fertilizer prices are regulated by the government. A product sold at 40–50% below MRP is almost certainly adulterated or fake. A 5–15% discount from a licensed retailer is normal.</p><h3>4. Always Read the Product Label</h3><p>Every legitimate agri-input must carry: manufacturer name and address, registration/licence number, batch number, manufacturing and expiry date, chemical composition, and first aid instructions. If any of these are missing on delivery, reject the product.</p><h3>5. Keep Your Invoice</h3><p>A registered seller will always provide a bill. This is your proof of purchase if you need to complain to the state agriculture department about a substandard product.</p><h2>How KrishiDukaan Makes This Easier</h2><p>On KrishiDukaan, every seller is verified, has a physical address on record, and can be reached by phone directly from the product listing. You can see real-time stock levels and order directly from the retailer with online delivery — with end-to-end order tracking.</p><blockquote>The safest online agri-purchase is one made from a local, registered retailer whose shop you can actually visit. KrishiDukaan brings you exactly that — the convenience of online with the trust of local.</blockquote><h2>What to Do If You Receive a Fake Product</h2><ol><li>Don't use the product. Keep it sealed for evidence.</li><li>Report to the retailer immediately and ask for a replacement or refund.</li><li>If unresolved, report to your state's Agriculture Department or the nearest Krishi Vigyan Kendra (KVK).</li><li>You can also file a complaint with the company whose product was faked — most major brands have dedicated helplines.</li></ol>`,
    tags: ["fertilizers", "online shopping", "farmer safety", "agri inputs"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80",
    readTime: 7,
  },
  {
    title: "KaranArjun Power Plus: The Biostimulant Trusted by 75,000+ Farmers",
    slug: "karanarjun-power-plus-biostimulant-trusted-farmers",
    excerpt: "What makes Power Plus the go-to seaweed biostimulant for Maharashtra and AP farmers? We break down how it works, which crops benefit most, and how to get maximum yield.",
    content: `<h2>What Is a Biostimulant — and Why Do Farmers Need One?</h2><p>A biostimulant is a substance that, when applied to plants, stimulates natural processes to improve nutrient uptake, stress tolerance, and overall crop quality — without being a fertilizer or pesticide. Think of it as a "performance enhancer" for your crop.</p><h2>What Is Power Plus?</h2><p>Power Plus is a <strong>liquid seaweed extract biostimulant</strong> manufactured by KaranArjun. It is derived from <em>Ascophyllum nodosum</em> and other marine algae, cold-processed to preserve bioactive compounds.</p><p>Key active components:</p><ul><li><strong>Cytokinins</strong> — promote cell division, delay leaf senescence, improve fruit set</li><li><strong>Auxins</strong> — stimulate root initiation and elongation</li><li><strong>Gibberellins</strong> — improve germination, elongation, and flowering</li><li><strong>Betaines and mannitol</strong> — protect plants against drought and salinity stress</li><li><strong>Alginic acid</strong> — improves soil structure and microbial activity</li></ul><h2>What Results Do Farmers Report?</h2><ul><li><strong>Improved root development</strong> — visible within 7–10 days of application</li><li><strong>Better fruit colour and weight</strong> — particularly in grapes, pomegranate, tomato, and mango</li><li><strong>Improved fruit retention</strong> — reduced flower and fruit drop</li><li><strong>Stress recovery</strong> — faster recovery after drought, waterlogging, or cold spell</li><li><strong>Enhanced fertilizer efficiency</strong> — crops need 10–15% less NPK when biostimulants are applied</li></ul><blockquote>75,800+ farmers have used Power Plus across India. We don't just sell it — we recommend it because it consistently delivers results across diverse crops and soil types.</blockquote><h2>Which Crops Benefit Most?</h2><ul><li>Grapes (berry sizing and colour development)</li><li>Pomegranate (fruit retention and splitting reduction)</li><li>Tomato, Chilli, Capsicum (flower set and fruit sizing)</li><li>Paddy and Wheat (tillering and grain filling)</li><li>Sugarcane (stalk elongation and juice quality)</li><li>Cotton (boll development and retention)</li></ul><h2>How to Use Power Plus</h2><p><strong>Foliar spray:</strong> Mix 2–3 ml per litre of water. Spray at transplanting/establishment, vegetative growth, pre-flowering, and fruit development stages.</p><p><strong>Drip/fertigation:</strong> Mix 1–1.5 litres per acre in irrigation water during active growth periods.</p><p><strong>Seed treatment:</strong> Soak seeds in 5 ml/litre solution for 6–8 hours before sowing to improve germination rate.</p><p>2–3 applications per crop cycle spaced 15–20 days apart give the best results.</p><h2>Where to Buy</h2><p>Power Plus is available from <strong>verified agri-retailers on KrishiDukaan</strong>. Search for "Power Plus" on the platform to see which nearby stores have it in stock and order online for home delivery.</p>`,
    tags: ["power plus", "biostimulant", "seaweed extract", "crop yield", "karanarjun"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80",
    readTime: 8,
  },
  {
    title: "How to Register Your Agri-Retail Shop on KrishiDukaan and Reach More Farmers",
    slug: "how-to-register-agri-retail-shop-on-krishidukan",
    excerpt: "A step-by-step guide for agri-retailers and manufacturers to get listed on KrishiDukaan, set up their product catalog, and start receiving orders from farmers in their area.",
    content: `<h2>Why Every Agri-Retailer Needs a Digital Presence</h2><p>India has over 2.5 lakh agri-input retailers. Most rely entirely on word-of-mouth to run their business. Farmers increasingly use smartphones to research products before visiting a shop. If your shop doesn't appear online, you're invisible to a growing segment of your potential customers. <strong>KrishiDukaan gives you a free digital presence</strong> — without the cost or complexity of building your own website.</p><h2>What You Get as a KrishiDukaan Retailer</h2><ul><li><strong>Business profile</strong> — shop name, owner name, address, contact number, and a short bio visible to all farmers nearby</li><li><strong>Product listings</strong> — list any products from the KrishiDukaan catalog and set your own selling price</li><li><strong>Location listing</strong> — appear in the store map for farmers searching within 5, 10, or 25 km of your shop</li><li><strong>Online ordering</strong> — optionally enable online delivery so farmers can order directly from their phone</li><li><strong>Manufacturer connections</strong> — connect with manufacturers to get products assigned to your store</li></ul><h2>Step-by-Step: How to Register</h2><h3>Step 1 — Sign Up</h3><p>Visit <strong>krishidukan.com</strong>, click "Account," and sign up with your phone number. An OTP will be sent to verify your number.</p><h3>Step 2 — Select Your Role</h3><p>During registration, select <strong>"Retailer."</strong> This unlocks the retailer dashboard with product listing and order management features.</p><h3>Step 3 — Complete Your Business Profile</h3><p>Fill in your shop name, owner name, address, and contact number. Set your location on the map so farmers searching nearby can find you.</p><h3>Step 4 — Subscribe</h3><p>A small one-time subscription activates your seller features. Think of it as replacing the cost of printing 500 business cards — but with 10× the reach.</p><h3>Step 5 — List Your Products</h3><p>Browse the KrishiDukaan product catalog and add the products you stock. Set your selling price for each. Farmers searching for that product will now see your shop as a nearby source.</p><h3>Step 6 — Enable Online Delivery (Optional)</h3><p>Go to Settings in your dashboard and toggle "Online Delivery" on. Once enabled, farmers can place orders directly to you through the app — you manage delivery your way.</p><h2>Tips for Getting More Customers</h2><ul><li>Keep your stock status up to date — farmers trust "In Stock" labels</li><li>Add a tagline and bio to your profile — "Serving Nashik farmers since 2010" builds trust instantly</li><li>Enable online delivery even if you only deliver within 5 km — it dramatically increases orders</li><li>Respond to orders quickly — a fast acceptance time builds your reputation on the platform</li></ul><blockquote>50+ retailers have already joined the KrishiDukaan network. Be part of the platform that's connecting Indian agriculture's last mile.</blockquote><h2>Register Today</h2><p>Visit krishidukan.com, click "Account," and sign up as a retailer. The whole process takes under 10 minutes.</p>`,
    tags: ["retailers", "register", "agri business", "sell online", "dealer"],
    author: "KrishiDukaan Team",
    status: "published",
    coverImage: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80",
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
      let created = 0;
      for (const p of SEED_POSTS) {
        await createBlogPost(p);
        created++;
      }
      showToast(`${created} posts published successfully!`);
      await load();
    } catch (e: any) {
      const msg = e?.code === "permission-denied"
        ? "Permission denied — make sure you're logged in as admin"
        : (e?.message ?? "Seed failed");
      showToast(msg, "error");
      console.error("Seed error:", e);
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
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-on-surface sm:text-2xl">Blog Posts</h1>
          <p className="mt-0.5 text-xs text-on-surface-variant sm:text-sm">{posts.length} total · {posts.filter(p => p.status === "published").length} published</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-3">
          {posts.length === 0 && (
            <button
              type="button"
              onClick={handleSeedPosts}
              disabled={seeding}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-black text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
            >
              {seeding ? "Publishing…" : "✦ Publish 4 Sample Posts"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        </div>
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
              className="rounded-2xl border border-surface-container bg-white p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                {post.coverImage ? (
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="h-36 w-full rounded-xl object-cover sm:h-14 sm:w-20 sm:shrink-0"
                  />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center rounded-xl bg-primary/10 sm:h-14 sm:w-20 sm:shrink-0">
                    <span className="text-2xl">🌿</span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${post.status === "published" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      {post.status === "published" ? "Published" : "Draft"}
                    </span>
                    {(post.tags || []).slice(0, 2).map(t => (
                      <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {t}
                      </span>
                    ))}
                  </div>
                  <h3 className="mb-0.5 line-clamp-2 text-base font-black leading-snug text-on-surface sm:line-clamp-1">{post.title}</h3>
                  <p className="line-clamp-2 text-sm text-on-surface-variant sm:line-clamp-1">{post.excerpt}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    <span className="max-w-full truncate">By {post.author}</span>
                    <span className="hidden sm:inline">·</span>
                    <span>{formatDate(post.status === "published" ? post.publishedAt : post.createdAt)}</span>
                    {post.readTime && <><span className="hidden sm:inline">·</span><span>{post.readTime} min read</span></>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 sm:shrink-0">
                  {post.status === "published" && (
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-[11px] font-bold text-on-surface hover:bg-surface-container hover:text-primary transition-colors sm:h-10 sm:w-10 sm:border-0 sm:px-0 sm:py-0"
                      title="View post"
                    >
                      <Eye className="h-4 w-4 shrink-0" />
                      <span className="sm:hidden">View</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(post)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-[11px] font-bold text-on-surface hover:bg-surface-container hover:text-primary transition-colors sm:h-10 sm:w-10 sm:border-0 sm:px-0 sm:py-0"
                    title="Edit post"
                  >
                    <PenLine className="h-4 w-4 shrink-0" />
                    <span className="sm:hidden">Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(post.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors sm:h-10 sm:w-10 sm:border-0 sm:px-0 sm:py-0 sm:text-on-surface-variant sm:hover:text-red-600"
                    title="Delete post"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span className="sm:hidden">Delete</span>
                  </button>
                </div>
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
