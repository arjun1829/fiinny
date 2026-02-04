import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useVelocity } from "framer-motion";
import { PieChart, Users, Globe, Trophy } from "lucide-react";
import TypewriterText from "@/components/animations/TypewriterText";
import { useState, useEffect } from "react";

export const features = [
    {
        id: "analytics",
        title: "Deep Analytics",
        subtitle: "Know where every penny goes.",
        description: (
            <>
                <p className="mb-4">Every time you spend money, Fiinny quietly keeps track for you. Instead of scrolling through confusing bank statements, you see clean charts, trends, and summaries that make sense instantly.</p>
                <div className="bg-teal-50 p-5 rounded-xl border border-teal-100 mb-6">
                    <p className="font-bold text-teal-800 mb-2 flex items-center gap-2">
                        <span className="bg-teal-200 text-teal-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Example</span>
                    </p>
                    <p className="text-sm text-teal-900 font-medium mb-2">If you spent ₹18,000 on food last month, Fiinny shows:</p>
                    <ul className="list-disc list-inside text-sm text-teal-700 space-y-1 ml-1">
                        <li>Where you spent the most</li>
                        <li>How it compares to previous months</li>
                        <li>Whether it’s increasing or under control</li>
                    </ul>
                </div>
                <p className="italic text-slate-500">You don’t need to calculate anything. Fiinny does the thinking — you just see the answers.</p>
            </>
        ),
        color: "from-teal-500 to-emerald-600",
        image: "/assets/images/3d-analytics.png",
        icon: PieChart
    },
    {
        id: "shared",
        title: "Shared Finances",
        subtitle: "Better Together.",
        description: (
            <>
                <p className="mb-4">Money conversations don’t have to be awkward. Fiinny helps you manage shared expenses with your partner, friends, or roommates — clearly and fairly.</p>
                <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100 mb-6">
                    <p className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                        <span className="bg-indigo-200 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Example</span>
                    </p>
                    <p className="text-sm text-indigo-900 font-medium mb-2">You and your partner split rent, groceries, and subscriptions. Fiinny shows:</p>
                    <ul className="list-disc list-inside text-sm text-indigo-700 space-y-1 ml-1">
                        <li>Who paid what</li>
                        <li>Who owes whom</li>
                        <li>The current balance — transparently</li>
                    </ul>
                </div>
                <p className="italic text-slate-500">Everyone sees the same picture. No spreadsheets. No awkward reminders.</p>
            </>
        ),
        color: "from-blue-500 to-indigo-600",
        image: "/assets/images/3d-couple.png",
        icon: Users
    },
    {
        id: "global",
        title: "Multi-Currency",
        subtitle: "Track globally.",
        description: (
            <>
                <p className="mb-4">Money today doesn’t stay in one country. Fiinny helps you track expenses across multiple currencies without confusion.</p>
                <div className="bg-amber-50 p-5 rounded-xl border border-amber-100 mb-6">
                    <p className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                        <span className="bg-amber-200 text-amber-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Example</span>
                    </p>
                    <p className="text-sm text-amber-900 font-medium mb-2">You book flights in USD, pay hotels in EUR, and spend locally in INR. Fiinny:</p>
                    <ul className="list-disc list-inside text-sm text-amber-700 space-y-1 ml-1">
                        <li>Keeps original currency</li>
                        <li>Shows converted values clearly</li>
                        <li>Gives you a single financial view</li>
                    </ul>
                </div>
                <p className="italic text-slate-500">No manual conversions. No guessing how much you really spent. Perfect for travellers.</p>
            </>
        ),
        color: "from-amber-500 to-orange-600",
        image: "/assets/images/3d-global-humans.png",
        icon: Globe
    },
    {
        id: "goals",
        title: "Financial Goals",
        subtitle: "Dream big.",
        description: (
            <>
                <p className="mb-4">Everyone has goals — travel, savings, security. Fiinny helps you turn those goals into something visible and trackable.</p>
                <div className="bg-rose-50 p-5 rounded-xl border border-rose-100 mb-6">
                    <p className="font-bold text-rose-800 mb-2 flex items-center gap-2">
                        <span className="bg-rose-200 text-rose-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Example</span>
                    </p>
                    <p className="text-sm text-rose-900 font-medium mb-2">You set a goal: “Save ₹2,00,000 for Europe trip”. Fiinny shows:</p>
                    <ul className="list-disc list-inside text-sm text-rose-700 space-y-1 ml-1">
                        <li>How much you’ve saved</li>
                        <li>How much is left</li>
                        <li>Whether your current spending supports or slows the goal</li>
                    </ul>
                </div>
                <p className="italic text-slate-500">You don’t feel guilty — you feel informed. Goals adjust as life changes.</p>
            </>
        ),
        color: "from-rose-500 to-pink-600",
        image: "/assets/images/3d-goals.png",
        icon: Trophy
    }
];

interface FloatingFeatureStackProps {
    onSelectFeature?: (id: string) => void;
}

export default function FloatingFeatureStack({ onSelectFeature }: FloatingFeatureStackProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Velocity Detection
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const [isFast, setIsFast] = useState(false);

    useEffect(() => {
        return scrollVelocity.on("change", (latest) => {
            if (Math.abs(latest) > 500) {
                setIsFast(true);
            } else {
                const timer = setTimeout(() => setIsFast(false), 500);
                return () => clearTimeout(timer);
            }
        });
    }, [scrollVelocity]);

    // Variants for the Cinematic Focus Effect
    const cardVariants = {
        idle: {
            filter: "blur(0px)",
            scale: 1,
            opacity: 1,
            zIndex: 10,
            transition: { duration: 0.4 }
        },
        focused: {
            filter: "blur(0px)",
            scale: 1.05,
            opacity: 1,
            zIndex: 30, // Bring to front
            transition: { duration: 0.4, type: "spring" as const, stiffness: 300, damping: 20 }
        },
        blurred: {
            filter: "blur(4px)",
            scale: 0.95,
            opacity: 0.6,
            zIndex: 5, // Push back
            transition: { duration: 0.4 }
        }
    };

    // Helper to determine state
    const getVariant = (id: string) => {
        if (!hoveredId) return "idle";
        return hoveredId === id ? "hovered" : "blurred";
    };

    return (
        <section className="py-8 lg:py-16 bg-slate-50 overflow-visible relative min-h-[800px]">
            {/* Background Atmosphere - Global Ambient Glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-gradient-radial from-teal-100/40 via-blue-50/20 to-transparent rounded-full blur-3xl"
                />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                {/* Section Header */}
                {/* Section Header - Typewriter Effect */}
                <div className="text-center max-w-5xl mx-auto mb-4 lg:mb-8">
                    <TypewriterText
                        forceIsFast={isFast}
                        className="text-5xl lg:text-8xl font-black text-slate-900 mb-4 tracking-tighter leading-[1.05]"
                        lines={[
                            { text: "Everything you need." },
                            { text: "All in one place.", highlight: true }
                        ]}
                    />
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: false, margin: isFast ? "0px" : "-20%" }}
                        transition={{ delay: isFast ? 0.2 : 2.2, duration: 0.8 }}
                        className="text-xl lg:text-2xl text-slate-500 leading-relaxed font-medium max-w-3xl mx-auto"
                    >
                        Powerful tools wrapped in a stunning interface. Designed to make managing money feel effortless.
                    </motion.p>
                </div>
            </div>

            {/* Floating Stack Container */}
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: false, margin: isFast ? "0px" : "-20%" }}
                variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                        opacity: 1,
                        y: 0,
                        transition: {
                            delayChildren: isFast ? 0.4 : 3.0, // Wait for text (2.2s + 0.8s duration)
                            staggerChildren: 0.2
                        }
                    }
                }}
                className="relative w-full max-w-5xl mx-auto lg:h-[700px]"
            >

                {/* --- HERO CARD (Analytics) --- */}
                <motion.div
                    className="relative lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 w-full lg:w-[500px] lg:h-[500px] mb-8 lg:mb-0"
                    onHoverStart={() => setHoveredId("analytics")}
                    onHoverEnd={() => setHoveredId(null)}
                    animate={getVariant("analytics")}
                    variants={cardVariants}
                >
                    {/* Spotlight */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-teal-400/20 blur-3xl rounded-full -z-10" />

                    <motion.div
                        animate={{ y: hoveredId ? 0 : [0, -10, 0] }} // Stop floating when interacted with
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        onClick={() => onSelectFeature?.("analytics")}
                        className="bg-white/90 backdrop-blur-xl border border-teal-500/20 rounded-[32px] p-8 lg:p-10 shadow-2xl shadow-teal-900/40 h-full flex flex-col relative overflow-hidden group cursor-pointer"
                    >
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold w-fit mb-4">
                                <PieChart className="w-3.5 h-3.5" /> Analytics
                            </div>
                            <h3 className="text-3xl font-bold text-slate-900 mb-2 leading-tight">
                                Know where every <br /> penny goes.
                            </h3>
                            <p className="text-slate-500 font-medium">Deep insights into your spending.</p>

                            <div className="mt-auto flex justify-center translate-y-4 lg:translate-y-8 relative">
                                {/* Pulsing Chart Effect under the image */}
                                <motion.div
                                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="absolute inset-0 bg-teal-400/20 blur-2xl rounded-full"
                                />
                                <Image
                                    src="/assets/images/3d-analytics.png"
                                    alt="Analytics"
                                    width={400}
                                    height={400}
                                    className="w-full max-w-[320px] object-contain drop-shadow-2xl relative z-10"
                                />
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-50/0 via-teal-50/0 to-teal-100/30 pointer-events-none" />
                    </motion.div>
                </motion.div>


                {/* --- SUPPORTING CARD 1 (Shared Finances) --- */}
                <motion.div
                    className="relative lg:absolute lg:left-0 lg:top-[15%] w-full lg:w-[380px] lg:h-[350px] mb-8 lg:mb-0"
                    onHoverStart={() => setHoveredId("shared")}
                    onHoverEnd={() => setHoveredId(null)}
                    animate={getVariant("shared")}
                    variants={cardVariants}
                >
                    <motion.div
                        animate={{ y: hoveredId ? 0 : [0, -12, 0] }}
                        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        onClick={() => onSelectFeature?.("shared")}
                        className="bg-slate-900 rounded-[28px] p-8 shadow-lg shadow-slate-900/10 h-full relative overflow-hidden group cursor-pointer border border-slate-800"
                    >
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-bold w-fit mb-4 backdrop-blur-md">
                                <Users className="w-3.5 h-3.5" /> Shared Finances
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Better Together.</h3>
                            <p className="text-slate-400 text-sm mb-6">Manage bills with your partner.</p>

                            <div className="flex justify-center relative">
                                <Image
                                    src="/assets/images/3d-couple.png"
                                    alt="Shared"
                                    width={250}
                                    height={250}
                                    className="w-[180px] object-contain drop-shadow-lg relative z-10"
                                />
                            </div>
                        </div>
                        <div className="absolute bottom-0 right-0 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl" />
                    </motion.div>
                </motion.div>


                {/* --- SUPPORTING CARD 2 (Track Globally) --- */}
                <motion.div
                    className="relative lg:absolute lg:right-[-60px] lg:bottom-[10%] w-full lg:w-[450px] lg:h-[280px] mb-8 lg:mb-0"
                    onHoverStart={() => setHoveredId("global")}
                    onHoverEnd={() => setHoveredId(null)}
                    animate={getVariant("global")}
                    variants={cardVariants}
                >
                    <motion.div
                        animate={{ y: hoveredId ? 0 : [0, -8, 0] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                        onClick={() => onSelectFeature?.("global")}
                        className="bg-[#FFF6EF] rounded-[28px] p-8 shadow-xl shadow-orange-900/5 h-full relative overflow-hidden group cursor-pointer border border-orange-100"
                    >
                        <div className="flex items-center justify-between h-full relative z-10">
                            <div className="flex-1 pr-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-800 text-xs font-bold w-fit mb-4">
                                    <Globe className="w-3.5 h-3.5" /> Multi-Currency
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Track globally.</h3>
                                <p className="text-slate-500 text-sm font-medium">Track in 100+ currencies.</p>
                            </div>
                            <div className="flex-1 flex justify-end">
                                <motion.div
                                    whileHover={{ scale: 1.1 }}
                                    transition={{ type: "spring" as const, stiffness: 300 }}
                                >
                                    <Image
                                        src="/assets/images/3d-global-humans.png"
                                        alt="Global"
                                        width={280}
                                        height={280}
                                        className="w-[200px] object-contain drop-shadow-xl"
                                    />
                                </motion.div>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/0 via-orange-100/0 to-orange-100/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    </motion.div>
                </motion.div>


                {/* --- SUPPORTING CARD 3 (Optimization) --- */}
                <motion.div
                    className="relative lg:absolute lg:left-[40px] lg:bottom-[5%] w-full lg:w-[280px] lg:h-[280px] mb-8 lg:mb-0"
                    onHoverStart={() => setHoveredId("goals")}
                    onHoverEnd={() => setHoveredId(null)}
                    animate={getVariant("goals")}
                    variants={cardVariants}
                >
                    <motion.div
                        animate={{ y: hoveredId ? 0 : [0, -6, 0] }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                        onClick={() => onSelectFeature?.("goals")}
                        className="bg-amber-50 rounded-[28px] p-6 shadow-md shadow-amber-900/5 h-full border border-amber-100 relative overflow-hidden group cursor-pointer"
                    >
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold w-fit mb-4">
                                <Trophy className="w-3.5 h-3.5" /> Optimization
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-1">Dream big.</h3>
                            <p className="text-slate-500 text-xs">Allocate for what matters.</p>

                            <div className="flex justify-center mt-6">
                                <motion.div
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <Image
                                        src="/assets/images/3d-goals.png"
                                        alt="Goals"
                                        width={160}
                                        height={160}
                                        className="w-[120px] object-contain drop-shadow-lg"
                                    />
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

            </motion.div>
        </section >
    );
}
