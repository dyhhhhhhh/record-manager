"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type CustomSelectOption = {
  value: string;
  label: string;
  tone?: "neutral" | "blue" | "amber" | "green" | "teal" | "red" | "orange";
};

const TONE_CLASS = {
  neutral: "bg-slate-400",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-emerald-600",
  teal: "bg-teal-600",
  red: "bg-red-600",
  orange: "bg-orange-500"
} as const;

export function CustomSelect({
  name,
  ariaLabel,
  defaultValue,
  options,
  disabled = false,
  className = ""
}: {
  name: string;
  ariaLabel: string;
  defaultValue: string;
  options: readonly CustomSelectOption[];
  disabled?: boolean;
  className?: string;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialIndex = Math.max(0, options.findIndex((option) => option.value === defaultValue));
  const [previousDefaultValue, setPreviousDefaultValue] = useState(defaultValue);
  const [selectedValue, setSelectedValue] = useState(options[initialIndex]?.value ?? "");
  const [highlightedIndex, setHighlightedIndex] = useState(initialIndex);
  const [open, setOpen] = useState(false);

  if (previousDefaultValue !== defaultValue) {
    const nextIndex = Math.max(0, options.findIndex((option) => option.value === defaultValue));
    setPreviousDefaultValue(defaultValue);
    setSelectedValue(options[nextIndex]?.value ?? "");
    setHighlightedIndex(nextIndex);
    setOpen(false);
  }

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function showOptions() {
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    setSelectedValue(option.value);
    setHighlightedIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        showOptions();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => (current + direction + options.length) % options.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightedIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "Space") {
      event.preventDefault();
      if (open) choose(highlightedIndex);
      else showOptions();
      return;
    }
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") setOpen(false);
  }

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <input name={name} readOnly type="hidden" value={selectedValue} />
      <button
        aria-activedescendant={open ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="flex h-12 w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 text-left text-sm font-semibold shadow-[0_6px_20px_rgb(35_43_37/0.04)] outline-none transition hover:border-black/20 focus-visible:border-[var(--green)] focus-visible:ring-4 focus-visible:ring-emerald-900/10 disabled:cursor-not-allowed disabled:bg-black/[0.035] disabled:text-[var(--muted)] disabled:shadow-none"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : showOptions()}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={`size-2.5 shrink-0 rounded-full ${TONE_CLASS[selectedOption?.tone ?? "neutral"]}`} />
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label}</span>
        <ChevronDown className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} size={17} />
      </button>
      {open ? (
        <div
          aria-label={`${ariaLabel}选项`}
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-black/10 bg-[var(--surface)] p-1.5 shadow-[0_22px_60px_rgb(23_32_27/0.2)]"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const selected = option.value === selectedValue;
            const highlighted = index === highlightedIndex;
            return (
              <button
                aria-selected={selected}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${highlighted ? "bg-[var(--green)] text-white" : "hover:bg-black/[0.045]"}`}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => choose(index)}
                onPointerMove={() => setHighlightedIndex(index)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${highlighted ? "bg-white/80" : TONE_CLASS[option.tone ?? "neutral"]}`} />
                <span className="min-w-0 flex-1">{option.label}</span>
                {selected ? <Check aria-hidden="true" size={16} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
