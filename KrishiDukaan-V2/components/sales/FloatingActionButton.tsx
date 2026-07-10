"use client";

import { Plus } from "lucide-react";

interface FloatingActionButtonProps {
  onClick: () => void;
  label?: string;
}

export default function FloatingActionButton({ onClick, label = "Add" }: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-6 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-harvest text-white shadow-lg shadow-harvest/30 transition active:scale-95 hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-harvest/30"
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} />
    </button>
  );
}
