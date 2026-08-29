import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Badge } from "./Badge.vue";

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        primary:
          "border-transparent bg-primary/10 text-primary [a&]:hover:bg-primary/20",
        secondary:
          "border-transparent bg-input text-white [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
      size: {
        xs: "px-1 py-[2px] text-xs leading-none gap-0.5 [&>svg]:size-2.5",
        sm: "px-1.5 py-0.5 text-xs gap-1 [&>svg]:size-3",
        md: "px-2 py-0.5 text-sm gap-1 [&>svg]:size-3",
        lg: "px-2.5 py-0.5 text-sm gap-1.5 [&>svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);
export type BadgeVariants = VariantProps<typeof badgeVariants>;
