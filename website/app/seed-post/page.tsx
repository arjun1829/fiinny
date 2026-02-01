"use client";

import React, { useState } from 'react';
import { BlogService } from '@/lib/blog-service';

export default function SeedPostPage() {
    const [status, setStatus] = useState('Idle');

    const handleSeed = async () => {
        setStatus('Publishing EVERYTHING...');
        try {
            // ==========================================
            // POST 1: Ostrich Effect
            // ==========================================
            const slug1 = "why-ambiguity-is-killing-your-peace-of-mind";
            let existing1 = await BlogService.getPostBySlug(slug1);

            const postContent1 = `
                <p>There is a concept in behavioral finance called the <strong>"Ostrich Effect."</strong> 🙈</p>
                
                <img src="/blog/ostrich/final/Gemini_Generated_Image_9mqve9mqve9mqve9.jpg" alt="The Ostrich Effect Definition" class="rounded-lg my-6 w-full" />

                <p>It describes our tendency to avoid negative financial information because we think it will ruin our mood. We see this all the time: smart, capable professionals who are terrified to open their banking app after a weekend of spending.</p>

                <h2 class="text-2xl font-bold mt-8 mb-4">But here is the irony: The ambiguity is actually more stressful than the reality. 🧠</h2>

                <p>When you refuse to look, your brain fills in the gaps with worst-case scenarios. You carry a low-level background anxiety that affects your focus, your sleep, and your decision-making.</p>

                <img src="/blog/ostrich/final/Gemini_Generated_Image_s9yhlps9yhlps9yh.jpg" alt="The Irony: Ambiguity is scarier" class="rounded-lg my-6 w-full" />

                <h2 class="text-2xl font-bold mt-8 mb-4">The antidote isn't necessarily having more money. It is Clarity. ✨</h2>

                <img src="/blog/ostrich/final/Gemini_Generated_Image_qv0w8yqv0w8yqv0w.jpg" alt="The Antidote is Clarity" class="rounded-lg my-6 w-full" />

                <p>Knowing you have exactly ₹2,000 left for the week is surprisingly peaceful. It gives you boundaries. It gives you control. It turns a vague fear into a manageable fact.</p>

                <h2 class="text-2xl font-bold mt-8 mb-4">We built Fiinny to solve exactly this problem.</h2>
                
                <img src="/blog/ostrich/final/Gemini_Generated_Image_nzo3ipnzo3ipnzo3.jpg" alt="Fiinny App Interface" class="rounded-lg my-6 w-full" />

                <p>We stripped away the judgment, the complex charts, and the red flashing lights. We simply provide a calm, clear view of where you stand so you can stop hiding and start managing.</p>

                <ul class="list-none space-y-2 mt-4 font-medium">
                    <li>❌ No Judgment</li>
                    <li>❌ No Complicated Charts</li>
                    <li>✅ Just Clarity</li>
                </ul>

                <img src="/blog/ostrich/final/Gemini_Generated_Image_rxq2ekrxq2ekrxq2.jpg" alt="Stop Hiding Start Tracking" class="rounded-lg my-8 w-full" />

                <div class="bg-teal-50 border border-teal-100 p-6 rounded-xl mt-8 text-center">
                    <h3 class="font-bold text-lg mb-2">Call to Action</h3>
                    <p class="mb-4">If you’ve been playing the "Ostrich" with your finances, try getting clarity this week.</p>
                    <a href="https://fiinny.com" class="inline-block bg-teal-600 text-white px-6 py-2 rounded-full font-bold hover:bg-teal-700 transition-colors">Download Fiinny Here</a>
                </div>

                <hr class="my-10 border-slate-200" />

                <div class="prose-sm text-slate-600 bg-slate-50 p-6 rounded-xl">
                    <h3 class="text-lg font-bold text-slate-900 mb-4">Scared to look at your bank account? 🫣</h3>
                    
                    <p>If you avoid opening your banking app after a pricey weekend, you aren't bad with money—you’re just experiencing the "Ostrich Effect."</p>
                    
                    <p>It’s a psychological trick our brains play on us: we avoid negative information to protect our feelings. But here is the irony... not knowing is actually scarier than the reality.</p>
                    
                    <p>That constant background anxiety comes from the unknown.</p>
                    
                    <p><strong>The Solution:</strong> The antidote isn't getting rich overnight; it's Clarity. Knowing you have exactly ₹2,000 left for the week is far more peaceful than guessing you have "somewhere between zero and nothing."</p>
                    
                    <p>We built Fiinny to be the anti-anxiety finance tracker. ❌ No red flashing lights. ❌ No judgment. ✅ Just a calm, clear view of where you stand.</p>
                    
                    <p class="font-bold mt-4">Call to Action: Stop hiding. Start tracking. 🔗 Download Fiinny at the link in our bio.</p>
                    
                    <p class="text-xs text-teal-600 mt-4">
                        #Fiinny #FinancialWellness #MoneyMindset #OstrichEffect #FinancialAnxiety #BudgetingTips #FintechIndia #MentalHealthAndMoney #Clarity #expensetracker
                    </p>
                </div>

                <p class="text-sm text-slate-400 mt-8">#FinancialWellness #Fintech #MentalHealth #Productivity #PersonalFinance #StartupIndia #Fiinny</p>
                 
                <div class="flex gap-4 mt-4">
                     <a href="https://www.instagram.com/p/DULLuEak8fM/?utm_source=ig_web_button_share_sheet&igsh=MzRlODBiNWFlZA==" target="_blank" class="text-pink-600 hover:underline">Instagram</a>
                     <a href="https://www.linkedin.com/posts/fiinny-inc_scared-to-look-at-your-bank-account-activity-7423340918637850624-Dz1J?utm_source=share&utm_medium=member_desktop&rcm=ACoAAGI1htgBqh5AJAAmKvMC7GvfkMiWoYcD9Tc" target="_blank" class="text-blue-700 hover:underline">LinkedIn</a>
                </div>
            `;

            const postData1 = {
                slug: slug1,
                title: "Why ambiguity is killing your peace of mind (and how to fix it).",
                excerpt: "There is a concept in behavioral finance called the 'Ostrich Effect.' It describes our tendency to avoid negative financial information because we think it will ruin our mood.",
                content: postContent1,
                coverImage: "/blog/ostrich/final/Gemini_Generated_Image_sn01hpsn01hpsn01.jpg",
                author: "Fiinny Team",
                date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                readTime: "3 min read",
                categories: ["Financial Wellness", "Psychology"],
                seoTitle: "Why ambiguity is killing your peace of mind | Fiinny Blog",
                seoDescription: "Discover the Ostrich Effect in finance: why ignoring your bank balance increases anxiety and how clarity brings peace of mind with Fiinny.",
            };

            if (!existing1) {
                await BlogService.createPost(postData1);
            } else {
                await BlogService.updatePost(existing1.id!, postData1);
            }


            // ==========================================
            // POST 2: Managing Money
            // ==========================================
            const slug2 = "managing-money-shouldnt-feel-like-work";
            let existing2 = await BlogService.getPostBySlug(slug2);


            const postContent2 = `
                <p class="font-bold text-lg mb-4">Yet most finance apps today are cluttered, restrictive, or built around limits — limits on how many expenses you can add, how many friends you can split with, or how much insight you can actually see without interruptions.</p>

                <p class="mb-4">Fiinny was built to fix that.</p>
                
                <p class="mb-6">Fiinny is a modern expense tracker and bill-splitting app designed to reduce daily effort and bring clarity to personal and shared finances. Whether you’re tracking everyday spending, splitting expenses with friends or partners, or reviewing monthly trends, Fiinny keeps everything simple, fast, and stress-free.</p>

                <h2 class="text-2xl font-bold mt-8 mb-4">THE PROBLEM WITH MOST FINANCE APPS</h2>
                <ul class="list-disc pl-5 space-y-2 mb-6">
                    <li>Too many manual steps for basic tracking</li>
                    <li>Duplicate entry for personal and shared expenses</li>
                    <li>Monthly insights that ignore recent days</li>
                    <li>Limits on expenses, groups, or transactions</li>
                    <li>Ads and prompts blocking core usage</li>
                    <li>Sharing that feels complicated and incomplete</li>
                </ul>

                <p class="font-bold text-lg mb-8">Fiinny solves these problems at the core.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">SMART & EFFORTLESS TRACKING</h3>
                <p class="mb-6">Fiinny is designed to minimize daily effort. Add expenses and income in seconds through a clean, fast interface focused on clarity, not complexity. No unnecessary steps, no clutter — tracking fits naturally into your routine.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">AUTO SYNC & SMART CONTEXT</h3>
                <p class="mb-6">Fiinny supports automatic and assisted tracking flows to help you stay consistent without micromanaging entries. Your expenses stay organized with context, making patterns easier to understand without extra work.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">SPLIT BILLS DIRECTLY FROM EXPENSES</h3>
                <p class="mb-6">Unlike traditional apps that require separate or duplicate entries, Fiinny lets you split bills directly from the expense screen. Simply swipe right on any expense, choose a friend or group, and it’s done. No re-adding expenses, no switching screens — personal tracking and shared expenses work together seamlessly.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">REAL MONTHLY INSIGHTS — INCLUDING RECENT DAYS</h3>
                <p class="mb-6">Fiinny’s monthly analysis always includes the most recent days of spending, even near month-end. This ensures your insights reflect your real financial behavior, not partial data or delayed updates.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">UNLIMITED EXPENSES, NO ARTIFICIAL BLOCKS</h3>
                <p class="mb-6">Track as many expenses as you want and split as many transactions as you need. Fiinny does not impose hidden caps or restrict essential features. Add, manage, and share expenses freely — without interruptions.</p>

                <h3 class="text-xl font-bold mt-6 mb-2">WHO FIINNY IS FOR</h3>
                <ul class="list-disc pl-5 space-y-2 mb-6">
                    <li>People tired of manual expense tracking</li>
                    <li>Users switching from restrictive bill-splitting apps</li>
                    <li>Couples and groups managing shared finances</li>
                    <li>Anyone who wants clarity, not clutter, in their money</li>
                </ul>

                <hr class="my-8 border-slate-200" />

                <p class="text-lg font-medium text-center italic mb-8">Fiinny isn’t about forcing habits. It’s about reducing effort, increasing visibility, and giving you peace of mind.</p>

                <div class="text-center">
                    <h3 class="text-2xl font-bold mb-4">Start managing money with clarity.</h3>
                    <a href="https://fiinny.com" class="inline-block bg-teal-600 text-white px-8 py-3 rounded-full font-bold hover:bg-teal-700 transition-colors">Download Fiinny</a>
                </div>
            `;

            const postData2 = {
                slug: slug2,
                title: "Managing money shouldn’t feel like work.",
                excerpt: "Fiinny is a modern expense tracker and bill-splitting app designed to reduce daily effort and bring clarity to personal and shared finances.",
                content: postContent2,
                coverImage: "/blog/managing-money-cover.png",
                author: "Fiinny Team",
                date: "December 27, 2025",
                readTime: "3 min read",
                categories: ["Philosophy", "Product"],
                seoTitle: "Managing money shouldn’t feel like work | Fiinny Philosophy",
                seoDescription: "Fiinny isn’t about forcing habits. It’s about reducing effort, increasing visibility, and giving you peace of mind. Discover the Fiinny difference.",
            };

            if (!existing2) {
                await BlogService.createPost(postData2);
            } else {
                await BlogService.updatePost(existing2.id!, postData2);
            }

            setStatus('Published BOTH Posts to Firestore!');

        } catch (e) {
            console.error(e);
            setStatus('Error: ' + JSON.stringify(e));
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
                <h1 className="text-2xl font-bold mb-6">Final Publish: All Content</h1>
                <p className="text-slate-600 mb-6">Click below to push BOTH "Ostrich" and "Managing Money" posts to Firestore immediately.</p>
                <button
                    onClick={handleSeed}
                    disabled={status.includes('...')}
                    className="w-full bg-teal-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                    {status === 'Idle' ? 'Push Everything to Firestore' : status}
                </button>
            </div>
        </div>
    );
}