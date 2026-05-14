import type { InjectionKey, Ref } from "vue";

export type MorphingDialogContext = {
  isOpen: Ref<boolean>;
  setIsOpen: (value: boolean) => void;
  uniqueId: string;
  triggerRef: Ref<HTMLButtonElement | null>;
};

export const MorphingDialogKey
  = Symbol() as InjectionKey<MorphingDialogContext>;
