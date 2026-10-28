"use client";

import { useEffect, useRef, useState } from "react";

// Five whimsical moods for Ziki, each with an emoji, color, and animation.
const MOODS = [
  { emoji: "\ud83e\udde0", name: "Curious", color: "#3978F6", animate: "motion-safe:animate-pulse" },
  { emoji: "\ud83e\udd0d", name: "Focused", color: "#0E9F8E", animate: "motion-safe:animate-bounce" },
  { emoji: "\u26a1", name: "Excited", color: "#E07A2E", animate: "motion-safe:animate-pulse" },
  { emoji: "\ud83c\udf37", name: "Calm", color: "#10B981", animate: "" },
  { emoji: "\ud83e\udd00", name: "Playful", color: "#D04F7A", animate: "motion-safe:animate-bounce" },
];

export function ZikiMoodAgent() {
  const [moodIndex, setMoodIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const rerollRef = useRef<HTMLButtonElement>(null);

  // Pick a random mood on mount and whenever the user rerolls.
  useEffect(() => {
    setMoodIndex(Math.floor(Math.random() * MOODS.length));
  }, []);

  const reroll = () => {
    setIsSpinning(true);
    setTimeout(() => {
      setMoodIndex((prev) => {
        let next = Math.floor(Math.random() * MOODS.length);
        while (next === prev && MOODS.length > 1) next = Math.floor(Math.random() * MOODS.length);
        return next;
      });
      setIsSpinning(false);
    }, 600);
  };

  const mood = MOODS[moodIndex];

  return (
    <button
      type="button"
      onClick={reroll}
      ref={rerollRef}
      aria-label={`Ziki mood: ${mood.name} — click to reroll`}
      title="Ziki mood agent — click to reroll"
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zk-border bg-zk-surface text-zk-text hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong transition-transform duration-300"
      aria-pressed={isSpinning}
    >
      {/* Sleeping / awake Ziki avatar — sleeping when no agent is active, awake when one is. */}
      <span className="absolute -inset-px rounded-full bg-conic from-transparent via-transparent to-transparent" aria-hidden="true" />
      <span
        className={`relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-zk-surface shadow-lg transition-all duration-300 ${
          isSpinning ? "motion-safe:animate-spin" : ""
        }`}
      >
        <span style={{ color: mood.color }} className="text-2xl leading-none">
          {mood.emoji}
        </span>
      </span>

      {/* Tooltip showing the current mood name. */}
      <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden sm:block whitespace-nowrap rounded-lg bg-zk-surface px-2 py-1 text-xs font-medium text-zk-text border border-zk-border shadow-lg">
        Ziki: {mood.name}
      </span>
    </button>
  );
}
