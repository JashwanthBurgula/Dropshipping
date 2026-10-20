import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "amber"
  | "buyNow";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#1D4ED8] text-[#FFFFFF] border border-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E40AF]",
  secondary:
    "bg-[#FFFFFF] text-[#101828] border border-[#DDE1E6] hover:bg-[#F5F6F7] active:bg-[#DDE1E6]",
  outline:
    "bg-transparent text-[#101828] border border-[#DDE1E6] hover:bg-[#F5F6F7]",
  ghost:
    "bg-transparent text-[#101828] border border-transparent hover:bg-[#F5F6F7]",
  danger:
    "bg-[#B42318] text-[#FFFFFF] border border-[#B42318] hover:bg-[#991B1B]",
  amber:
    "bg-[#FFB400] text-[#101828] border border-[#FFB400] hover:bg-[#E5A300] font-semibold",
  buyNow:
    "bg-[#C2410C] text-[#FFFFFF] border border-[#C2410C] hover:bg-[#9A3412] font-semibold",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[44px] px-3.5 py-2 text-sm",
  md: "min-h-[44px] px-5 py-2.5 text-sm",
  lg: "min-h-[48px] px-6 py-3 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      fullWidth = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || isLoading);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[4px] font-sans font-medium",
          "transition-colors duration-150",
          "select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
