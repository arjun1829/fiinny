export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    readTime: string;
    author: string;
    categories: string[];
    content: string; // We'll use simple HTML/string for now, or markdown if needed later.
}

export const blogPosts: BlogPost[] = [
    {
        slug: "why-managing-money-shouldnt-feel-like-work",
        title: "Managing money shouldn’t feel like work.",
        excerpt: "Most finance apps are cluttered and restrictive. Fiinny is built to fix that with unlimited expenses, smart tracking, and zero clutter.",
        date: "December 27, 2025",
        readTime: "3 min read",
        author: "Fiinny Team",
        categories: ["Philosophy", "Product"],
        content: `
            <p class="lead text-xl mb-8">Yet most finance apps today are cluttered, restrictive, or built around limits — limits on how many expenses you can add, how many friends you can split with, or how much insight you can actually see without interruptions.</p>
            
            <h2 class="text-2xl font-bold mb-4 mt-8">Fiinny was built to fix that.</h2>
            <p class="mb-6">Fiinny is a modern expense tracker and bill-splitting app designed to reduce daily effort and bring clarity to personal and shared finances. Whether you’re tracking everyday spending, splitting expenses with friends or partners, or reviewing monthly trends, Fiinny keeps everything simple, fast, and stress-free.</p>

            <div class="bg-slate-50 p-8 rounded-2xl border border-slate-100 my-8">
                <h3 class="text-xl font-bold mb-4">THE PROBLEM WITH MOST FINANCE APPS</h3>
                <ul class="space-y-2">
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Too many manual steps for basic tracking</li>
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Duplicate entry for personal and shared expenses</li>
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Monthly insights that ignore recent days</li>
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Limits on expenses, groups, or transactions</li>
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Ads and prompts blocking core usage</li>
                    <li class="flex items-start"><span class="mr-2 text-rose-500">•</span> Sharing that feels complicated and incomplete</li>
                </ul>
            </div>

            <h2 class="text-2xl font-bold mb-6">Fiinny solves these problems at the core.</h2>

            <div class="space-y-8">
                <div>
                    <h3 class="text-xl font-bold text-teal-600 mb-2">SMART & EFFORTLESS TRACKING</h3>
                    <p>Fiinny is designed to minimize daily effort. Add expenses and income in seconds through a clean, fast interface focused on clarity, not complexity. No unnecessary steps, no clutter — tracking fits naturally into your routine.</p>
                </div>

                <div>
                    <h3 class="text-xl font-bold text-teal-600 mb-2">AUTO SYNC & SMART CONTEXT</h3>
                    <p>Fiinny supports automatic and assisted tracking flows to help you stay consistent without micromanaging entries. Your expenses stay organized with context, making patterns easier to understand without extra work.</p>
                </div>

                <div>
                    <h3 class="text-xl font-bold text-teal-600 mb-2">SPLIT BILLS DIRECTLY FROM EXPENSES</h3>
                    <p>Unlike traditional apps that require separate or duplicate entries, Fiinny lets you split bills directly from the expense screen. Simply swipe right on any expense, choose a friend or group, and it’s done. No re-adding expenses, no switching screens — personal tracking and shared expenses work together seamlessly.</p>
                </div>

                <div>
                    <h3 class="text-xl font-bold text-teal-600 mb-2">REAL MONTHLY INSIGHTS — INCLUDING RECENT DAYS</h3>
                    <p>Fiinny’s monthly analysis always includes the most recent days of spending, even near month-end. This ensures your insights reflect your real financial behavior, not partial data or delayed updates.</p>
                </div>

                <div>
                    <h3 class="text-xl font-bold text-teal-600 mb-2">UNLIMITED EXPENSES, NO ARTIFICIAL BLOCKS</h3>
                    <p>Track as many expenses as you want and split as many transactions as you need. Fiinny does not impose hidden caps or restrict essential features. Add, manage, and share expenses freely — without interruptions.</p>
                </div>
            </div>

            <hr class="my-10 border-slate-100" />

            <h3 class="text-xl font-bold mb-4">WHO FIINNY IS FOR</h3>
            <ul class="space-y-2 mb-8 list-disc pl-5">
                <li>People tired of manual expense tracking</li>
                <li>Users switching from restrictive bill-splitting apps</li>
                <li>Couples and groups managing shared finances</li>
                <li>Anyone who wants clarity, not clutter, in their money</li>
            </ul>

            <p class="font-bold text-lg">Fiinny isn’t about forcing habits.</p>
            <p>It’s about reducing effort, increasing visibility, and giving you peace of mind.</p>
        `
    }
];
