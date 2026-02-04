"use client";

import { motion, useScroll, useVelocity, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

interface TypewriterTextProps {
    lines: {
        text: string;
        highlight?: boolean;
        gradient?: string;
    }[];
    className?: string;
    baseDuration?: number; // Base duration per character
    fastDuration?: number; // Duration when scrolling fast
    velocityThreshold?: number;
    forceIsFast?: boolean;
}

export default function TypewriterText({
    lines,
    className = "",
    baseDuration = 0.03,
    fastDuration = 0.005,
    velocityThreshold = 500,
    forceIsFast = false
}: TypewriterTextProps) {
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const [internalIsFast, setInternalIsFast] = useState(false);
    const isFast = forceIsFast || internalIsFast;

    useEffect(() => {
        return scrollVelocity.on("change", (latest) => {
            if (Math.abs(latest) > velocityThreshold) {
                setInternalIsFast(true);
            } else {
                // Optional: Debounce resetting to false if we want "momentum"
                // For now, let's keep it sticking to fast if triggered to ensure completion
                const timer = setTimeout(() => setInternalIsFast(false), 500);
                return () => clearTimeout(timer);
            }
        });
    }, [scrollVelocity, velocityThreshold]);

    const containerVariants = {
        hidden: { opacity: 1 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: isFast ? fastDuration : baseDuration,
                delayChildren: 0.1
            }
        }
    };

    const childVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: "spring" as const,
                damping: 12,
                stiffness: 100
            }
        }
    };

    return (
        <motion.h2
            initial="hidden"
            whileInView="visible"
            // Trigger earlier if fast scrolling (-10% vs -20%)
            viewport={{ once: false, margin: isFast ? "0px" : "-20%" }}
            variants={containerVariants}
            className={className}
        >
            {lines.map((line, lineIdx) => (
                <span
                    key={lineIdx}
                    className={`block ${line.highlight ? (line.gradient || "text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600 animate-gradient") : ""} ${lineIdx < lines.length - 1 ? "mb-2" : ""}`}
                >
                    {Array.from(line.text).map((char, charIdx) => (
                        <motion.span
                            key={`${lineIdx}-${charIdx}`}
                            variants={childVariants}
                        >
                            {char === " " ? "\u00A0" : char}
                        </motion.span>
                    ))}
                </span>
            ))}
        </motion.h2>
    );
}
