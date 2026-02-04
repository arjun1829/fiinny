"use client";

import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle2,
  Shield,
  Users,
  Zap,
  PieChart,
  Trophy,
  Play,
  FileText,
  Globe,
  Instagram,
  Linkedin,
  ChevronDown,
  X,
  EyeOff,
  Smartphone
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { User as FirebaseUser } from "firebase/auth";
import LanguageSelector from "@/components/LanguageSelector";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { translations } from "./i18n/translations";
import FloatingFeatureStack, { features } from "@/components/FloatingFeatureStack";
import TypewriterText from "@/components/animations/TypewriterText";
import AiOverlay from "@/components/ai/AiOverlay";

export default function Home() {
  return (
    <LanguageProvider>
      <MainContent />
    </LanguageProvider>
  );
}

function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);


  const slides = [
    {
      id: 1,
      title: "Auto-organized spending",
      src: "/assets/hero/hero-1.jpg",
      desc: "Expenses grouped automatically."
    },
    {
      id: 2,
      title: "Split & settle instantly",
      src: "/assets/hero/hero-2.jpg",
      desc: "Shared expense → Settled."
    },
    {
      id: 3,
      title: "Know where your money goes",
      src: "/assets/hero/hero-4.jpg",
      desc: "Chart + Insight bubble."
    },
    {
      id: 4,
      title: "Your data stays with you",
      src: "/assets/hero/hero-5.jpg",
      desc: "Local-first privacy."
    }
  ];

  // Auto-Rotate Logic (Every 3 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center z-10">

      {/* 1. The Rotating Image Stage */}
      <div className="relative w-[300px] h-[600px] md:w-[350px] md:h-[650px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"

          >

            {/* Image Container with Shadow */}
            <div className="relative rounded-[3rem] overflow-hidden shadow-2xl shadow-teal-900/20 border-4 border-white h-full w-full">
              <a href="#features">
                <Image
                  src={slides[currentIndex].src}
                  alt={slides[currentIndex].title}
                  fill
                  className="object-cover bg-slate-100"
                  priority
                />
              </a>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 2. The Bottom Navigation Bar (Slider) */}
      <div className="absolute -bottom-6 flex items-center gap-3 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full border border-slate-200 shadow-lg z-30">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(index)}
            className={`transition-all duration-500 rounded-full h-2 ${currentIndex === index
              ? "w-8 bg-gradient-to-r from-teal-500 to-emerald-500"
              : "w-2 bg-slate-300 hover:bg-teal-200"
              }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

    </div>
  );
}

function MainContent() {
  const { user } = useAuth();

  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const { language } = useLanguage();
  const t = translations[language];

  // Animation variants
  const fadeInUp = {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" }
  };

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };



  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">
      {/* Navigation */}
      {/* Split Floating Island Navigation */}
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.5 }}
        className="fixed top-6 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 pointer-events-none"
      >
        {/* Left Island: Brand */}
        <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 group">
            <div className="relative w-8 h-8 rounded-full overflow-hidden">
              <Image src="/assets/images/logo_icon.png" alt="Fiinny" fill className="object-cover" />
            </div>
            <span className="text-xl font-black text-teal-950 tracking-tight group-hover:text-teal-700 transition-colors">Fiinny</span>
          </Link>
        </div>

        {/* Right Island: Navigation & Actions */}
        <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center gap-6 md:gap-8">
          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-6">
            <a href="#features" className="text-sm font-bold text-slate-600 hover:text-teal-700 transition-colors">{t.nav.features}</a>
            <Link href="/how-it-works" className="text-sm font-bold text-slate-600 hover:text-teal-700 transition-colors">{t.nav.howItWorks}</Link>
            <Link href="/trust" className="text-sm font-bold text-slate-600 hover:text-teal-700 transition-colors">{t.nav.trust}</Link>
            {!user && <Link href="/subscription" className="text-sm font-bold text-slate-600 hover:text-teal-700 transition-colors">{t.nav.pricing}</Link>}
          </div>

          {/* Action Button */}
          <div>
            {user ? (
              <Link href="/dashboard" className="flex items-center gap-2">
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt="Profile"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-white">
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
              </Link>
            ) : (
              <Link href="/login" className="bg-slate-900 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-slate-900/20">
                Get Started
              </Link>
            )}
          </div>
        </div>
      </motion.nav>

      {/* NEW HERO SECTION START */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-slate-50">

        {/* Background Atmosphere */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-b from-teal-50/80 to-transparent rounded-full blur-3xl -z-10 opacity-60" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-50/50 rounded-full blur-3xl -z-10 opacity-40" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* ----- LEFT COLUMN: Text Content ----- */}
            <div className="text-center lg:text-left z-20">
              <div className="mb-8">
                <TypewriterText
                  className="text-5xl lg:text-8xl font-black tracking-tighter text-slate-900 mb-4 leading-[1.05]"
                  lines={[
                    { text: "Financial clarity," },
                    { text: "automated.", highlight: true, gradient: "text-transparent bg-clip-text bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-600 animate-gradient pb-2" }
                  ]}
                />
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 2.0, duration: 0.8 }}
                  className="text-2xl lg:text-4xl font-bold text-slate-400 tracking-tight"
                >
                  No spreadsheets. No guesswork.
                </motion.h2>
              </div>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 2.2, duration: 0.8 }}
                className="text-xl text-slate-600 mb-10 leading-relaxed font-medium max-w-lg mx-auto lg:mx-0"
              >
                Track personal and shared expenses in one system that works for you.
                <br className="hidden lg:block" />
                Auto-organized. Real-time insights. Zero manual effort.
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 2.4, duration: 0.8 }}
                className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12"
              >
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-teal-600 rounded-full hover:bg-teal-700 hover:shadow-xl hover:shadow-teal-200 hover:-translate-y-1 active:scale-95"
                >
                  Start Tracking
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-slate-700 transition-all duration-200 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-1 active:scale-95"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  See how it works
                </Link>
              </motion.div>

              {/* App Store Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 2.6, duration: 0.8 }}
                className="flex flex-wrap gap-4 justify-center lg:justify-start items-center"
              >
                <a href="#" className="hover:scale-105 transition-transform duration-300">
                  <Image
                    src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg"
                    alt="Download on the App Store"
                    width={150}
                    height={50}
                    className="h-12 w-auto"
                  />
                </a>
                <a href="#" className="hover:scale-105 transition-transform duration-300">
                  <Image
                    src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
                    alt="Get it on Google Play"
                    width={165}
                    height={50}
                    className="h-12 w-auto"
                  />
                </a>
              </motion.div>
            </div>


            {/* ----- RIGHT COLUMN: The Pulse Carousel ----- */}
            <div className="relative h-[650px] w-full flex flex-col items-center justify-center perspective-1000">

              {/* The Pulse Background Effect (Rings) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {[1, 2, 3].map((ring) => (
                  <motion.div
                    key={ring}
                    animate={{
                      scale: [0.8, 1.2, 0.8],
                      opacity: [0.1, 0.0, 0.1],
                      borderColor: ["rgba(20, 184, 166, 0.2)", "rgba(16, 185, 129, 0.1)", "rgba(20, 184, 166, 0.2)"]
                    }}
                    transition={{ duration: 4, repeat: Infinity, delay: ring * 1, ease: "easeInOut" }}
                    className="absolute rounded-full border border-teal-500/20 bg-teal-400/5"
                    style={{
                      width: `${ring * 280 + 200}px`,
                      height: `${ring * 280 + 200}px`,
                      zIndex: 0
                    }}
                  />
                ))}
              </div>

              {/* HERE IS THE MAGIC: Calling the function you pasted at the bottom */}
              <HeroCarousel />

            </div>

          </div>
        </div>
      </section>
      {/* NEW HERO SECTION END */}



      {/* Floating Feature Stack Section */}
      <div id="features">
        <FloatingFeatureStack onSelectFeature={setSelectedFeatureId} />
      </div>

      {/* Section 1: The Problem with Most Finance Apps - UPDATED */}
      {/* Section 1: The Problem with Most Finance Apps - UPDATED */}
      <section className="pt-48 pb-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-5xl lg:text-7xl font-black text-slate-900 mb-8 font-display tracking-tight leading-tight">
              Chaos costs <span className="text-rose-500">you money.</span> <br />
              Clarity builds <span className="text-teal-600">wealth.</span>
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed mb-16 font-medium">
              Most finance apps make you work for clarity. <br className="hidden md:block" />
              Fiinny works quietly in the background—automating, organizing, and protecting your money by default.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 text-left max-w-5xl mx-auto">
            {/* The Chaos Card */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="bg-white p-8 lg:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all duration-500"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full blur-3xl -z-10 opacity-50 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-2xl text-slate-900 mb-8 flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 text-rose-500 text-lg">⚠</span>
                The Chaos <span className="text-sm font-normal text-slate-400 ml-auto">(Most Apps)</span>
              </h3>
              <ul className="space-y-5">
                {[
                  "Manual entry that feels like homework",
                  "Your data sold, shared, or monetized",
                  "Monthly summaries that miss daily reality",
                  "Hard limits on your own data",
                  "Public by default"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-slate-600 text-base font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* The Fiinny System Card */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="bg-slate-900 p-8 lg:p-10 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden ring-1 ring-teal-500/30 transform md:-translate-y-4"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl" />

              <h3 className="font-bold text-2xl text-white mb-8 flex items-center gap-3 relative z-10">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-500/20 text-teal-400">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                The Fiinny System
              </h3>
              <ul className="space-y-5 relative z-10">
                {[
                  "Auto-capture in seconds",
                  "Zero-knowledge privacy architecture",
                  "Real-time financial clarity",
                  "No artificial limits",
                  "Private by design, always"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-slate-200 text-base font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2.5 flex-shrink-0 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Micro-CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-20 flex flex-col items-center"
          >
            <p className="text-slate-900 font-bold text-lg mb-6 tracking-tight">This is how modern money management should feel.</p>
            <Link
              href="/how-it-works"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-slate-200 text-slate-600 text-sm font-bold hover:border-teal-500 hover:text-teal-600 transition-all hover:shadow-lg hover:shadow-teal-100"
            >
              Explore the system
              <ChevronDown className="w-4 h-4 ml-1 group-hover:translate-y-0.5 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Watch Videos Section */}
      < section id="fiinny-ai" className="py-24 bg-slate-900 text-white overflow-hidden scroll-mt-24" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl lg:text-6xl font-bold mb-6 tracking-tight">
              What&apos;s <span className="text-teal-400">coming next.</span>
            </h2>
            <p className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
              We are just getting started. Here is what we are building now.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                src: "/assets/videos/Boy_s_Happy_Ball_Adventure.mp4",
                title: "Smarter Insights",
                desc: "Predictive analysis for your spending."
              },
              {
                src: "/assets/videos/Video_Generation_From_Image.mp4",
                title: "Predictive Nudges",
                desc: "Avoid overspending before it happens."
              },
              {
                src: "/assets/videos/Video_Generation_Request_and_Completion.mp4",
                title: "Context-aware Guidance",
                desc: "Financial advice that understands you."
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
      </section >



      {/* Trust Bridge Section - Unified with Engineering Vibe */}
      <section className="py-32 relative overflow-hidden bg-slate-50">
        {/* Technical Background Grid */}
        <div className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(#0f172a 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">

          {/* Header */}
          <div className="max-w-3xl mx-auto mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/5 text-slate-600 text-[11px] font-bold uppercase tracking-widest mb-10 border border-slate-900/10">
              Handcrafted Software
            </div>
            <h2 className="text-4xl lg:text-6xl font-black text-slate-900 mb-8 tracking-tight leading-tight">
              Built by engineers who <br />
              <span className="relative inline-block text-rose-600">
                hate broken money apps.
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-rose-500/20" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>
            </h2>
            <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto">
              Every interaction, every permission, every calculation is designed to respect your time, your money, and your privacy.
            </p>
          </div>

          {/* Logos in Glass Dock */}
          <div className="mb-20">
            <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 opacity-70">
              Experience from teams that built systems for
            </p>

            {/* Glass Dock Container */}
            <div className="inline-flex flex-wrap justify-center items-center gap-10 md:gap-16 bg-white/60 backdrop-blur-sm border border-slate-200/60 shadow-xl shadow-slate-200/50 rounded-[2.5rem] px-12 py-10 max-w-5xl mx-auto">
              {["Google", "Microsoft", "Amazon", "Spotify", "Uber"].map((brand) => (
                <span key={brand} className="text-2xl md:text-3xl font-black text-slate-400 hover:text-slate-900 transition-colors duration-500 cursor-default">{brand}</span>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 mt-8 text-sm font-medium text-slate-400">
              <div className="w-1 h-1 bg-teal-500 rounded-full" />
              Experience from companies where reliability isn’t optional.
            </div>
          </div>

          {/* Belief Statement - Styled as Technical Note */}
          <div className="max-w-2xl mx-auto pt-10 border-t border-slate-200/60">
            <p className="text-base text-slate-500 font-medium font-mono">
              <span className="text-slate-300 mr-2">//</span>
              "We believe financial software should work quietly, honestly, and in your favor."
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Privacy & Security - Cloud Aligned & Expanded */}
      <section className="pb-32 pt-20 bg-slate-900 border-t border-slate-800 text-white overflow-hidden">
        <div className="w-full px-6 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight">Your money. Secured & Synced.</h2>
            <p className="text-slate-400 mb-8 max-w-2xl mx-auto text-lg">
              We use bank-grade encryption to keep your financial life private, secure, and available across all your devices.
            </p>
            <p className="text-teal-400 text-sm font-bold bg-teal-900/30 inline-block px-5 py-2.5 rounded-full border border-teal-800 tracking-wide">
              Encrypted in transit. Encrypted at rest.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            <div className="bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-800 hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center justify-between mb-8">
                <span className="text-teal-500 font-bold block bg-teal-500/10 p-3 rounded-2xl"><Shield className="w-8 h-8" /></span>
                <span className="text-xs font-mono text-teal-500/50 uppercase tracking-wider">Standard: AES-256</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Bank-Grade Security</h3>
              <p className="text-slate-400 leading-relaxed text-base">
                Your data is protected with the same encryption standards used by banks. We prioritize your security above everything else.
                <br /><span className="text-slate-600 block mt-4 text-xs font-bold uppercase tracking-widest">Safe & Sound</span>
              </p>
            </div>

            <div className="bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-800 hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center justify-between mb-8">
                <span className="text-teal-500 font-bold block bg-teal-500/10 p-3 rounded-2xl"><EyeOff className="w-8 h-8" /></span>
                <span className="text-xs font-mono text-teal-500/50 uppercase tracking-wider">Model: Private</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">We Don&apos;t Sell Data</h3>
              <p className="text-slate-400 leading-relaxed text-base">
                Our business model is simple: we sell software, not personal data. Your financial habits are your business, not ours.
              </p>
            </div>

            <div className="bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-800 hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center justify-between mb-8">
                <span className="text-teal-500 font-bold block bg-teal-500/10 p-3 rounded-2xl"><Smartphone className="w-8 h-8" /></span>
                <span className="text-xs font-mono text-teal-500/50 uppercase tracking-wider">Access: 24/7</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Always Available</h3>
              <p className="text-slate-400 leading-relaxed text-base">
                Because your data is securely synced, your financial picture is always up to date, on every device you own. Do not worry about backups.
              </p>
            </div>
          </div>

          {/* Privacy Foundation Footer */}
          <div className="mt-20 text-center">
            <p className="text-slate-600 text-sm font-bold uppercase tracking-[0.2em]">
              Privacy isn’t a feature at Fiinny. It’s the foundation.
            </p>
          </div>
        </div>
      </section>

      {/* Pro-Level Testimonials */}
      <section className="py-32 bg-white border-t border-slate-100">
        <div className="w-full px-6 md:px-12 lg:px-24">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-widest mb-6 border border-teal-100">
              Community Stories
            </div>
            <h2 className="text-3xl lg:text-5xl font-black text-slate-900 tracking-tight mb-6">
              Money management for people <br /> who <span className="text-teal-600">take it seriously.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1: The Founder */}
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex gap-1 text-amber-500 mb-6">
                {[...Array(5)].map((_, i) => <span key={i}>★</span>)}
              </div>
              <p className="text-slate-700 font-medium leading-relaxed mb-8 relative z-10">
                "As a founder, I need to know my burn rate instantly. Fiinny is the only app that gives me that clarity without the manual spreadsheet work. It just clicks."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">A</div>
                <div>
                  <h4 className="font-bold text-slate-900">Arjun V.</h4>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Startup Founder</span>
                </div>
              </div>
            </div>

            {/* Testimonial 2: The Digital Nomad */}
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex gap-1 text-amber-500 mb-6">
                {[...Array(5)].map((_, i) => <span key={i}>★</span>)}
              </div>
              <p className="text-slate-700 font-medium leading-relaxed mb-8 relative z-10">
                "I earn in USD but spend in INR and EUR. Fiinny handles the multi-currency conversion automatically. It’s a lifesaver for my taxes."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-lg">S</div>
                <div>
                  <h4 className="font-bold text-slate-900">Sarah K.</h4>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Digital Nomad</span>
                </div>
              </div>
            </div>

            {/* Testimonial 3: The Privacy Advocate */}
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex gap-1 text-amber-500 mb-6">
                {[...Array(5)].map((_, i) => <span key={i}>★</span>)}
              </div>
              <p className="text-slate-700 font-medium leading-relaxed mb-8 relative z-10">
                "I deleted Mint because of the ads. I deleted heavy bank apps because they are slow. Fiinny is fast, private, and actually respects my data."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-lg">R</div>
                <div>
                  <h4 className="font-bold text-slate-900">Rahul M.</h4>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Sovereign Individual</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Unified Dark Footer & CTA */}
      <footer className="bg-slate-950 relative overflow-hidden pt-32 pb-12">
        {/* Ambient Background Glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-teal-500/10 rounded-full blur-[100px] opacity-30" />
          <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] opacity-20" />
        </div>

        <div className="w-full px-6 md:px-12 lg:px-24 relative z-10">

          {/* Step 1: The CTA */}
          <div className="text-center max-w-4xl mx-auto mb-32">
            <h2 className="text-5xl lg:text-7xl font-black text-white tracking-tight mb-8">
              Ready to master <br /> <span className="text-teal-400">your money?</span>
            </h2>
            <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Join thousands of users who have taken control of their financial life with Fiinny. Free forever for individuals.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-slate-950 transition-all duration-200 bg-white rounded-full hover:bg-teal-400 hover:scale-105 active:scale-95 min-w-[200px]"
              >
                Get Started Now
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 min-w-[200px]"
              >
                View Demo
              </Link>
            </div>
          </div>

          {/* Step 2: The Footer Navigation */}
          <div className="grid md:grid-cols-4 gap-12 border-t border-slate-800/50 pt-20 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center">
                  <span className="font-black text-slate-950 text-xs">F</span>
                </div>
                <span className="text-2xl font-black text-white tracking-tight">Fiinny</span>
              </div>
              <p className="text-slate-500 max-w-sm text-sm leading-relaxed mb-8">
                The smart, simple way to track expenses, split bills, and reach your financial goals. Built with privacy at its core.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="p-3 bg-slate-900 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"><Instagram className="w-5 h-5" /></a>
                <a href="#" className="p-3 bg-slate-900 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"><Linkedin className="w-5 h-5" /></a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-xs opacity-90">Product</h4>
              <ul className="space-y-4 text-slate-400 text-sm font-medium">
                <li><a href="#features" className="hover:text-teal-400 transition-colors">Features</a></li>
                <li><Link href="/subscription" className="hover:text-teal-400 transition-colors">Pricing</Link></li>
                <li><Link href="/download" className="hover:text-teal-400 transition-colors">Download</Link></li>
                <li><Link href="/changelog" className="hover:text-teal-400 transition-colors">Changelog</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-xs opacity-90">Company</h4>
              <ul className="space-y-4 text-slate-400 text-sm font-medium">
                <li><Link href="/about" className="hover:text-teal-400 transition-colors">About</Link></li>
                <li><Link href="/blog" className="hover:text-teal-400 transition-colors">Blog</Link></li>
                <li><Link href="/privacy" className="hover:text-teal-400 transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-teal-400 transition-colors">Terms Page</Link></li>
              </ul>
            </div>
          </div>

          {/* Step 3: Bottom Bar */}
          <div className="border-t border-slate-800/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-6 text-slate-500 text-sm font-medium">
            <p>© {new Date().getFullYear()} Fiinny Inc. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>



      {/* Video Modal */}
      <AnimatePresence>
        {
          selectedVideo && (
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
          )
        }

        {/* Feature Detail Modal */}
        {selectedFeatureId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4"
            onClick={() => setSelectedFeatureId(null)}
          >
            <motion.div
              layoutId={selectedFeatureId}
              className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl relative flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedFeatureId(null)}
                className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-rose-100 hover:text-rose-600 transition-colors z-20"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Left Column: Text */}
              <div className="p-6 md:p-12 flex-1 flex flex-col justify-center overflow-y-auto custom-scrollbar">
                {(() => {
                  const feature = features.find(f => f.id === selectedFeatureId);
                  if (!feature) return null;
                  const Icon = feature.icon || PieChart; // Fallback

                  return (
                    <>
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 w-fit mb-4 md:mb-6`}>
                        <Icon className="w-3.5 h-3.5" />
                        {feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}
                      </div>

                      <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                        {feature.subtitle}
                      </h3>

                      <div className="text-base md:text-lg text-slate-500 font-medium mb-8 leading-relaxed">
                        {feature.description}
                      </div>

                      <div>
                        <Link
                          href={user ? "/dashboard" : "/login"}
                          onClick={() => setSelectedFeatureId(null)}
                          className="inline-flex items-center justify-center px-8 py-3.5 text-base font-bold text-white transition-all duration-200 bg-slate-900 rounded-full hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5"
                        >
                          Try it now
                        </Link>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Right Column: Image */}
              <div className="bg-slate-50 flex-1 flex items-center justify-center p-8 relative overflow-hidden md:min-h-[500px]">
                <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-slate-100 opacity-50" />
                {features.find(f => f.id === selectedFeatureId)?.image && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="relative z-10"
                  >
                    <Image
                      src={features.find(f => f.id === selectedFeatureId)!.image!}
                      alt="Feature"
                      width={400}
                      height={400}
                      className="w-full max-w-[350px] object-contain drop-shadow-2xl"
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AiOverlay />
    </div>
  );
}
