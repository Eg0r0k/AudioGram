import type { Directive, DirectiveBinding } from "vue";
import { getLogger } from "@/lib/logger";

export interface CopyOptions {
  text?: string;
  onCopy?: (text: string) => void;
  onError?: (err: unknown) => void;
}

type CopyValue = string | CopyOptions | undefined;

const handlerMap = new WeakMap<HTMLElement, () => void>();

function createHandler(el: HTMLElement, binding: DirectiveBinding<CopyValue>) {
  return () => {
    const text = getText(el, binding.value);
    if (!text) return;
    copy(text, binding).catch(err => getLogger().error(`[vCopy] Copy failed: ${String(err)}`));
  };
}

async function copy(text: string, binding: DirectiveBinding<CopyValue>) {
  const opts = resolveOptions(binding.value);

  try {
    await navigator.clipboard.writeText(text);
    opts.onCopy?.(text);
  }
  catch (err) {
    fallbackCopy(text);
    opts.onCopy?.(text);
    opts.onError?.(err);
  }
}
function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function resolveOptions(value: CopyValue): CopyOptions {
  return typeof value === "string" ? { text: value } : (value ?? {});
}

function getText(el: HTMLElement, value: CopyValue): string {
  const opts = resolveOptions(value);
  return opts.text ?? el.textContent.trim();
}

export const vCopy: Directive<HTMLElement, CopyValue> = {
  mounted(el, binding) {
    const handler = createHandler(el, binding);

    handlerMap.set(el, handler);
    el.addEventListener("click", handler);
    if (!el.getAttribute("role")) el.setAttribute("role", "button");
    if (!el.getAttribute("tabindex")) el.setAttribute("tabindex", "0");
  },

  updated(el, binding) {
    const old = handlerMap.get(el);
    if (old) el.removeEventListener("click", old);

    const handler = createHandler(el, binding);

    handlerMap.set(el, handler);
    el.addEventListener("click", handler);
  },

  unmounted(el) {
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener("click", handler);
      handlerMap.delete(el);
    }
  },
};
