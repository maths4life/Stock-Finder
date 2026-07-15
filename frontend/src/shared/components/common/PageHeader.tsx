import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** The one heading pattern used across Discover, Screener, Research, Ideas, and Journal. */
export function PageHeader({ eyebrow, title, description, action, className }: Props) {
  return (
    <header className={"animate-fade-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 " + (className ?? "")}>
      <div>
        {eyebrow && <p className="text-eyebrow text-ink-subtle mb-3">{eyebrow}</p>}
        <h1 className="text-display md:text-display-lg text-balance max-w-[22ch]">{title}</h1>
        {description && <p className="mt-4 text-base text-ink-muted max-w-xl leading-relaxed text-pretty">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
