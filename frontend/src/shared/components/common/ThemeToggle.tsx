import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/shared/utils/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    const isLight = root.classList.contains("light");
    setIsDark(!isLight);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextDark = !isDark;
    setIsDark(nextDark);

    if (nextDark) {
      root.classList.remove("light");
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={cn(
          "size-8 rounded-md ring-1 ring-hairline bg-surface-raised flex items-center justify-center text-ink-muted",
          className,
        )}
      >
        <Moon className="size-4 opacity-50" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      aria-label={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      className={cn(
        "group relative size-8 rounded-md ring-1 ring-hairline bg-surface-raised hover:bg-secondary hover:ring-accent/40 flex items-center justify-center transition-all duration-200 cursor-pointer",
        className,
      )}
    >
      {isDark ? (
        <Sun className="size-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
      ) : (
        <Moon className="size-4 text-sky-600 group-hover:-rotate-12 transition-transform duration-300" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
