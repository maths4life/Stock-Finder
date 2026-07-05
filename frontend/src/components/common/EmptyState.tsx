import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Consistent empty state used anywhere a list/table can legitimately return zero rows. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: Props) {
  return (
    <div className={"flex flex-col items-center justify-center text-center py-16 px-6 " + (className ?? "")}>
      <div className="size-10 rounded-full bg-secondary grid place-items-center mb-4">
        <Icon className="size-4.5 text-ink-subtle" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 text-sm text-ink-muted max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
