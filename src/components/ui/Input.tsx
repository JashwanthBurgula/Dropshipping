import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  rightSlot?: React.ReactNode;
  hideRequiredIndicator?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      id,
      error,
      hint,
      rightSlot,
      hideRequiredIndicator = false,
      className,
      required,
      ...props
    },
    ref
  ) => {
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy = [
      hint ? hintId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={id}
          className="text-sm font-medium text-ink flex items-center justify-between"
        >
          <span>
            {label}
            {required && !hideRequiredIndicator ? (
              <span className="ml-1 text-clay-text" aria-hidden="true">
                *
              </span>
            ) : null}
          </span>
        </label>

        <div className="relative flex items-center">
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={describedBy}
            className={cn(
              "w-full min-h-[44px] rounded-control bg-paper px-3.5 py-2.5 text-base text-ink",
              "border transition-colors duration-fast ease-editorial",
              "placeholder:text-ink-muted/70",
              "disabled:cursor-not-allowed disabled:bg-sand disabled:opacity-70",
              error
                ? "border-brick focus-visible:outline-brick"
                : "border-stone hover:border-ink/40",
              rightSlot ? "pr-12" : "",
              className
            )}
            {...props}
          />
          {rightSlot ? (
            <div className="absolute right-1.5 flex items-center">{rightSlot}</div>
          ) : null}
        </div>

        {hint ? (
          <p id={hintId} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-sm font-medium text-brick"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
