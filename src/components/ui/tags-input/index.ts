import { cva, type VariantProps } from "class-variance-authority";

export const tagsInputVariants = cva(
  [
    "peer",
    "flex flex-wrap gap-2 items-center rounded-md border text-base md:text-sm",
    "min-h-9 px-3 py-2",
    "outline-none transition-[border-color,box-shadow] duration-200",

    "placeholder:font-medium placeholder:text-muted-foreground",
    "selection:bg-primary selection:text-primary-foreground",

    "border-border bg-transparent",
    "disabled:cursor-not-allowed disabled:opacity-50",

    "hover:border-primary",

    "focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--primary)]",

    "aria-invalid:border-destructive",
    "aria-invalid:focus-within:shadow-[0_0_0_1px_var(--destructive)]",
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
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      surface: "background",
      hasLabel: false,
    },
  },
);

export type TagsInputVariants = VariantProps<typeof tagsInputVariants>;
export { default as TagsInput } from "./TagsInput.vue";
export { default as TagsInputInput } from "./TagsInputInput.vue";
export { default as TagsInputItem } from "./TagsInputItem.vue";
export { default as TagsInputItemDelete } from "./TagsInputItemDelete.vue";
export { default as TagsInputItemText } from "./TagsInputItemText.vue";
