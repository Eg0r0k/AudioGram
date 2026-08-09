import { cva, type VariantProps } from "class-variance-authority";

export const inputVariants = cva(
  [
    "peer",
    "flex w-full min-w-0 rounded-md border text-base md:text-sm",
    "px-3 py-1 h-9",
    "outline-none transition-[border-color,box-shadow] duration-200",

    "placeholder:font-medium placeholder:text-muted-foreground",
    "selection:bg-primary selection:text-primary-foreground",

    // Hide the native number spinners (WebKit pseudo-elements + Firefox).
    "[&::-webkit-inner-spin-button]:appearance-none",
    "[&::-webkit-outer-spin-button]:appearance-none",
    "[&[type=number]]:[-moz-appearance:textfield]",

    "border-border bg-transparent",
    "disabled:cursor-not-allowed disabled:opacity-50",

    "hover:border-primary",

    "focus:border-primary focus:shadow-[0_0_0_1px_var(--primary)]",

    "aria-invalid:border-destructive",
    "aria-invalid:focus:shadow-[0_0_0_1px_var(--destructive)]",
  ],
  {
    variants: {
      surface: {
        background: "bg-background",
        card: "bg-card",
        popover: "bg-popover",
        muted: "bg-muted",
      },
      hasLabel: {
        true: "placeholder:opacity-0 focus:placeholder:opacity-100",
        false: "",
      },
    },
    defaultVariants: {
      surface: "background",
      hasLabel: false,
    },
  },
);

export type InputVariants = VariantProps<typeof inputVariants>;
export { default as Input } from "./Input.vue";
