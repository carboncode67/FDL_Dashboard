import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, onChange, ...props }: React.ComponentProps<"input">) {
  // Native `type="date"` inputs report value="" while a segment (e.g. the
  // year) is only partially typed, not just on an explicit clear. Feeding
  // that "" straight back in as the controlled value resets the browser's
  // in-progress typing buffer for the field being edited -- which is why
  // typing "2027" into the year can land as "0027" or "0007". Only forward
  // empty values that come from an actual deletion, so mid-typing "" events
  // don't round-trip back into the DOM and wipe what's still being typed.
  const handleChange =
    type === "date"
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          const isDeletion =
            e.nativeEvent instanceof InputEvent && !!e.nativeEvent.inputType?.startsWith("delete");
          if (e.target.value !== "" || isDeletion) {
            onChange?.(e);
          }
        }
      : onChange;

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      onChange={handleChange}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
