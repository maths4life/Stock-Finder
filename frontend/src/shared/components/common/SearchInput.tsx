import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({ value, onChange, placeholder = "Search…", className }: Props) {
  return (
    <div className={"relative " + (className ?? "")}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2.5 rounded-md ring-1 ring-hairline bg-surface-raised text-sm placeholder:text-ink-subtle outline-none focus:ring-hairline-strong transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition-colors"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
