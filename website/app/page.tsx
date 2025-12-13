"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  Users,
  Zap,
  PieChart,
  Heart,
  Trophy,
  Play,
  CreditCard,
  FileText,
  Coins,
  Globe,
  AlertCircle,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import LanguageSelector from "@/components/LanguageSelector";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { translations } from "./i18n/translations";
import AiOverlay from "@/components/ai/AiOverlay";

// Feature Data for Expansion
// Feature Data for Expansion moved inside component

export default function Home() {
  return (
    <LanguageProvider>
      <MainContent />
    </LanguageProvider>
  );
}

function MainContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const { language } = useLanguage();
  const t = translations[language];

  const features = [
    {
      id: "analytics",
      title: t.features.analytics.title,
      subtitle: t.features.analytics.badge,
      icon: <PieChart className="w-4 h-4" />,
      description: t.features.analytics.description,
      longDescription: t.features.analytics.description, // Reusing desc for longDesc for simplicity in translation or could add longDesc to dictionary
      image: "/assets/images/3d-analytics.png",
      color: "bg-white",
      textColor: "text-slate-900"
    },
    {
      id: "shared",
      title: t.features.shared.title,
      subtitle: t.features.shared.badge,
      icon: <Users className="w-4 h-4" />,
      description: t.features.shared.description,
      longDescription: t.features.shared.description,
      image: "/assets/images/3d-couple.png",
      color: "bg-slate-900",
      textColor: "text-white"
    },
    {
      id: "goals",
      title: t.features.goals.title,
      subtitle: t.features.goals.badge,
      icon: <Trophy className="w-4 h-4" />,
      description: t.features.goals.description,
      longDescription: t.features.goals.description,
      image: "/assets/images/3d-goals.png",
      color: "bg-white",
      textColor: "text-slate-900"
    },
    {
      id: "global",
      title: t.features.global.title,
      subtitle: t.features.global.badge,
      icon: <Globe className="w-4 h-4" />,
      description: t.features.global.description,
      longDescription: t.features.global.description,
      image: "/assets/images/3d-network.png",
      color: "bg-gradient-to-br from-teal-500 to-emerald-600",
      textColor: "text-white"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed w-full bg-white/95 backdrop-blur-lg z-50 border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-24">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Image src="/assets/images/logo_icon.png" alt="Fiinny" width={28} height={28} className="w-7 h-7" />
              <span className="text-2xl font-black bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent">Fiinny</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              <a href="#features" className="text-slate-700 hover:text-teal-600 transition-colors text-sm font-semibold">{t.nav.features}</a>
              <a href="#how-it-works" className="text-slate-700 hover:text-teal-600 transition-colors text-sm font-semibold">{t.nav.howItWorks}</a>
              <Link href="/subscription" className="text-slate-700 hover:text-teal-600 transition-colors text-sm font-semibold">{t.nav.pricing}</Link>

              <Link href="#fiinny-ai" className="relative group flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:border-teal-300 transition-all hover:shadow-md hover:-translate-y-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                <span className="text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent group-hover:from-teal-500 group-hover:to-emerald-500">
                  Fiinny AI
                </span>
              </Link>

              <div className="ml-4 pl-4 border-l border-slate-200">
                <LanguageSelector />
              </div>

              {/* Download Buttons */}
              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-200">
                <motion.a
                  href="https://play.google.com/store"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-md hover:shadow-lg"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                  </svg>
                  <span>{t.nav.playStore}</span>
                </motion.a>

                <motion.a
                  href="https://apps.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-md hover:shadow-lg"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
                  </svg>
                  <span>{t.nav.appStore}</span>
                </motion.a>
              </div>

              <Link href="/login" className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-teal-500/30 transition-all hover:scale-105 active:scale-95">
                {t.nav.login}
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden">
              <Link href="/login" className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold">
                {t.nav.login}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-sm font-bold mb-8 border border-teal-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                {t.hero.badge}
              </div>
              <h1 className="text-6xl lg:text-8xl font-bold tracking-tighter text-slate-900 mb-8 leading-[0.9]">
                {t.hero.titleStart} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">
                  {t.hero.titleHighlight}
                </span>
              </h1>
              <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-lg font-medium">
                {t.hero.subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-teal-600 rounded-full hover:bg-teal-700 hover:shadow-xl hover:shadow-teal-200 hover:-translate-y-1 active:scale-95"
                >
                  {t.hero.getStarted}
                </Link>
                <button
                  onClick={() => setSelectedVideo("/assets/videos/demo.mp4")}
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-slate-700 transition-all duration-200 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-1 active:scale-95"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  {t.hero.watchDemo}
                </button>
              </div>
              <p className="mt-6 text-sm text-slate-500 flex items-center gap-4 font-medium">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-teal-500" /> {t.hero.noCard}</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-teal-500" /> {t.hero.freePlan}</span>
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              className="relative lg:h-[700px] flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-teal-50 to-emerald-50 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 opacity-50" />
              <motion.div
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <Image
                  src="/hero-global.png"
                  alt="Financial Control Global"
                  width={900}
                  height={900}
                  className="relative z-10 w-full h-auto drop-shadow-2xl"
                  priority
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section - Apple Style Bento Grid */}
      <section className="py-32 bg-slate-50 relative overflow-hidden" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl lg:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
              {t.features.headerTitle} <br />
              <span className="text-teal-600">{t.features.headerHighlight}</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed font-medium">
              {t.features.headerSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 auto-rows-[400px]">

            {/* Card 1: Analytics (Large, Spans 2 cols) */}
            <motion.div
              layoutId="analytics"
              onClick={() => setSelectedId("analytics")}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2 bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all duration-500 overflow-hidden relative group cursor-pointer"
            >
              <div className="flex flex-col md:flex-row items-center gap-8 h-full">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-50 text-teal-700 text-sm font-bold mb-6">
                    <PieChart className="w-4 h-4" /> Analytics
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 mb-4">Know where every <br /> penny goes.</h3>
                  <p className="text-slate-500 text-lg max-w-sm">Deep insights into your spending habits with beautiful, interactive charts.</p>
                </div>
                <div className="flex-1 flex justify-center">
                  <Image
                    src="/assets/images/3d-analytics.png"
                    alt="Analytics"
                    width={500}
                    height={500}
                    className="w-[90%] max-w-[400px] h-auto drop-shadow-2xl object-contain transition-transform duration-700 group-hover:scale-105 group-hover:-translate-y-4"
                  />
                </div>
              </div>
            </motion.div>

            {/* Card 2: Couple/Shared */}
            <motion.div
              layoutId="shared"
              onClick={() => setSelectedId("shared")}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-slate-900 rounded-[2.5rem] p-10 shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden relative group text-white cursor-pointer"
            >
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-bold mb-6 backdrop-blur-md">
                  <Users className="w-4 h-4" /> Shared Finances
                </div>
                <h3 className="text-2xl font-bold mb-2">Better Together.</h3>
                <p className="text-slate-400 mb-6">Manage bills with your partner or flatmates seamlessly.</p>
                <div className="flex justify-center">
                  <Image
                    src="/assets/images/3d-couple.png"
                    alt="Couples"
                    width={300}
                    height={300}
                    className="w-48 h-auto drop-shadow-2xl transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
              </div>
            </motion.div>

            {/* Card 3: Goals (Standard) */}
            <motion.div
              layoutId="goals"
              onClick={() => setSelectedId("goals")}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all duration-500 overflow-hidden relative group cursor-pointer"
            >
              <div className="absolute inset-0 bg-amber-50/30" />
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-sm font-bold mb-6">
                  <Trophy className="w-4 h-4" /> Goals
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Dream big.</h3>
                <p className="text-slate-500 mb-6">Save for that trip or new gadget.</p>
                <div className="flex justify-center">
                  <Image
                    src="/assets/images/3d-goals.png"
                    alt="Goals"
                    width={250}
                    height={250}
                    className="w-48 h-auto drop-shadow-xl transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110"
                  />
                </div>
              </div>
            </motion.div>

            {/* Card 4: Global (Standard) - UPDATED */}
            <motion.div
              layoutId="global"
              onClick={() => setSelectedId("global")}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="md:col-span-2 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-[2.5rem] p-10 shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden relative group text-white cursor-pointer"
            >
              <div className="flex flex-col md:flex-row items-center gap-8 h-full">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm font-bold mb-6 backdrop-blur-md">
                    <Globe className="w-4 h-4" /> Multi-Currency
                  </div>
                  <h3 className="text-3xl font-bold mb-4">Track globally.</h3>
                  <p className="text-teal-50 text-lg">Tracks expenses in 100+ currencies. Perfect for travel and expats.</p>
                </div>
                <div className="flex-1 flex justify-center">
                  <Image
                    src="/assets/images/3d-network.png"
                    alt="Global"
                    width={300}
                    height={300}
                    className="w-64 h-auto drop-shadow-2xl transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3"
                  />
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Watch Videos Section */}
      <section id="fiinny-ai" className="py-24 bg-slate-900 text-white overflow-hidden scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl lg:text-6xl font-bold mb-6 tracking-tight">
              The <span className="text-teal-400">Vision.</span>
            </h2>
            <p className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
              A glimpse into the future of intelligent finance. This is what we are building.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                src: "/assets/videos/Boy_s_Happy_Ball_Adventure.mp4",
                title: "Joyful Tracking",
                desc: "Finance doesn't have to be boring."
              },
              {
                src: "/assets/videos/Video_Generation_From_Image.mp4",
                title: "Visual Intelligence",
                desc: "From receipt to insights in a blink."
              },
              {
                src: "/assets/videos/Video_Generation_Request_and_Completion.mp4",
                title: "Instant Answers",
                desc: "Your personal financial genius."
              }
            ].map((video, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => setSelectedVideo(video.src)}
                className="group relative rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 hover:border-teal-500/50 transition-colors cursor-pointer"
                onMouseEnter={(e) => {
                  const vid = e.currentTarget.querySelector('video');
                  if (vid) vid.play();
                }}
                onMouseLeave={(e) => {
                  const vid = e.currentTarget.querySelector('video');
                  if (vid) {
                    vid.pause();
                    vid.currentTime = 0;
                  }
                }}
              >
                <div className="aspect-[9/16] relative bg-black">
                  <video
                    src={video.src}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <Play className="w-8 h-8 text-white fill-current ml-1" />
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2 group-hover:text-teal-400 transition-colors">{video.title}</h3>
                  <p className="text-slate-400 text-sm">{video.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section - Moved Below Features */}
      <section className="py-20 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-10">
            Trusted by smart money managers at
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-20 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
            {["Google", "Microsoft", "Amazon", "Spotify", "Uber"].map((brand) => (
              <span key={brand} className="text-2xl md:text-3xl font-black text-slate-900">{brand}</span>
            ))}
          </div>
        </div>
      </section>


      {/* Testimonials */}
      <section className="py-24 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-center text-slate-900 mb-16">
            Loved by thousands of <br />
            <span className="text-teal-600">smart money managers.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "Finally, an app that doesn't feel like a spreadsheet. It's actually fun to track my expenses now.",
                author: "Priya M.",
                role: "Marketing Lead"
              },
              {
                quote: "The split bill feature saved my Goa trip. No more arguments about who owes what.",
                author: "Aditya K.",
                role: "Software Engineer"
              },
              {
                quote: "I love the privacy focus. Sharing finances with my partner without sharing every single transaction is a game changer.",
                author: "Sneha R.",
                role: "Architect"
              }
            ].map((testimonial, i) => (
              <div key={i} className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <div key={star} className="w-4 h-4 bg-amber-400 rounded-full" />
                  ))}
                </div>
                <p className="text-slate-700 mb-6 leading-relaxed">"{testimonial.quote}"</p>
                <div>
                  <p className="font-bold text-slate-900">{testimonial.author}</p>
                  <p className="text-sm text-slate-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-8">
            {t.cta.title}
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            {t.cta.subtitle}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-slate-900 transition-all duration-200 bg-white rounded-full hover:bg-teal-50 hover:scale-105 active:scale-95"
          >
            {t.cta.button}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-2">
              <div className="text-2xl font-bold text-teal-600 mb-4">Fiinny</div>
              <p className="text-slate-500 max-w-xs">
                {t.footer.tagline}
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">{t.nav.product}</h4>
              <ul className="space-y-2 text-slate-500">
                <li><a href="#" className="hover:text-teal-600">{t.nav.features}</a></li>
                <li><a href="#" className="hover:text-teal-600">{t.nav.pricing}</a></li>
                <li><a href="#" className="hover:text-teal-600">{t.nav.download}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">{t.nav.company}</h4>
              <ul className="space-y-2 text-slate-500">
                <li><a href="#" className="hover:text-teal-600">{t.nav.about}</a></li>
                <li><a href="#" className="hover:text-teal-600">{t.nav.privacy}</a></li>
                <li><a href="#" className="hover:text-teal-600">{t.nav.terms}</a></li>
                <li><Link href="/countries" className="hover:text-teal-600">{t.nav.countries}</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-8 text-center text-slate-400 text-sm">
            © {new Date().getFullYear()} Fiinny. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Expandable Card Overlay */}
      <AnimatePresence>
        {selectedId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedId(null)}
          >
            {features.map((feature) => (
              feature.id === selectedId && (
                <motion.div
                  layoutId={selectedId}
                  key={feature.id}
                  className={`w-full max-w-4xl ${feature.color} rounded-[2.5rem] overflow-hidden shadow-2xl relative`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setSelectedId(null)}
                    className="absolute top-6 right-6 p-2 bg-black/10 hover:bg-black/20 rounded-full transition-colors z-20"
                  >
                    <X className={`w-6 h-6 ${feature.textColor === 'text-white' ? 'text-white' : 'text-slate-900'}`} />
                  </button>

                  <div className="grid md:grid-cols-2 h-full">
                    <div className="p-10 md:p-14 flex flex-col justify-center relative">
                      <div className={`inline-flex self-start items-center gap-2 px-4 py-2 rounded-full ${feature.textColor === 'text-white' ? 'bg-white/20' : 'bg-slate-100'} ${feature.textColor} text-sm font-bold mb-6`}>
                        {feature.icon} {feature.subtitle}
                      </div>
                      <h3 className={`text-4xl md:text-5xl font-bold mb-6 ${feature.textColor}`}>{feature.title}</h3>
                      <p className={`text-lg md:text-xl leading-relaxed ${feature.textColor === 'text-white' ? 'text-slate-300' : 'text-slate-600'}`}>
                        {feature.longDescription}
                      </p>
                      <button className={`mt-8 px-8 py-4 rounded-full font-bold text-lg transition-transform hover:scale-105 active:scale-95 self-start ${feature.textColor === 'text-white' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
                        Try it now
                      </button>
                    </div>
                    <div className="relative h-64 md:h-auto bg-slate-100/50 flex items-center justify-center p-8">
                      <Image
                        src={feature.image}
                        alt={feature.title}
                        width={500}
                        height={500}
                        className="w-full h-auto object-contain drop-shadow-2xl max-h-[400px]"
                      />
                    </div>
                  </div>
                </motion.div>
              )
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Modal */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 lg:p-10"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-6xl max-h-[90vh] bg-black rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center"
            >
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-20 backdrop-blur-sm"
              >
                <X className="w-6 h-6" />
              </button>
              <video
                src={selectedVideo}
                controls
                autoPlay
                className="w-full h-full max-h-[85vh] object-contain bg-black"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AiOverlay />
    </div>
  );
}
