
import * as React from "react"
import { cn } from "@/lib/utils"
import { cva } from "class-variance-authority"

const inputVariants = cva(
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border bg-slate-500/10 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      size: {
        sm: "h-8 px-2 text-sm placeholder:text-sm file:h-6 file:text-xs",
        md: "h-10 px-3 text-base placeholder:text-base file:h-7 file:text-sm",
        lg: "h-12 px-4 text-lg placeholder:text-lg file:h-9 file:text-base",
        xl: "h-14 px-5 text-md placeholder:text-xl file:h-10 file:text-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const Input = React.forwardRef(({ className, type, size, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
