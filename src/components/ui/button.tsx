import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  // Lagoon & Brass: pill shape, 2px primary focus ring, subtle borders instead of shadows (spec §9).
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-[15px] font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.8] [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary font-bold text-primary-foreground hover:bg-[#0B3B40]",
        outline:
          "border-line-strong bg-surface text-text hover:bg-subtle aria-expanded:bg-subtle aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        secondary:
          "bg-primary-tint text-primary hover:bg-[color-mix(in_oklch,var(--primary-tint),var(--primary)_8%)] aria-expanded:bg-primary-tint",
        ghost: "text-text-2 hover:bg-subtle hover:text-text aria-expanded:bg-subtle aria-expanded:text-text",
        destructive: "bg-needs-tint text-needs-ink hover:bg-[color-mix(in_oklch,var(--needs-tint),var(--needs)_10%)]",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Touch targets: everything tappable is at least 48px tall; primary buttons 56-64.
        default: "h-12 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-8 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-10 gap-1.5 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 gap-3 px-6 text-base",
        xl: "h-16 gap-3 px-8 text-base",
        icon: "size-12",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-lg": "size-16 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
