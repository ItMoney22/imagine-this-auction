import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_10px_25px_rgba(79,70,229,0.25)]",
        secondary:
          "border border-white/60 bg-white/60 text-slate-900",
        destructive:
          "border-transparent bg-gradient-to-r from-rose-500 to-orange-500 text-white",
        outline: "border border-white/60 text-slate-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
