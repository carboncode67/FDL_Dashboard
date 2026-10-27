import { cn } from "@/lib/utils";
import { tagColorClass, type FarmTagOption } from "@/lib/farm-tags";

export function FarmTagChip({ tag, className }: { tag: FarmTagOption; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tagColorClass(tag.id),
        className
      )}
    >
      {tag.name}
    </span>
  );
}

export function FarmTagChips({ tags, empty }: { tags: FarmTagOption[]; empty?: React.ReactNode }) {
  if (tags.length === 0) return <>{empty ?? null}</>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <FarmTagChip key={t.id} tag={t} />
      ))}
    </div>
  );
}
