import {
  defineComponent,
  h,
  inject,
  markRaw,
  provide,
  shallowReactive,
  shallowRef,
  type Component,
  type InjectionKey,
  type PropType,
  type ShallowRef,
} from "vue";

/**
 * Imperative dialogs — a local copy of the vue-summon concept (MIT).
 *
 * `await summonDialog(Component, props)` mounts the component under
 * `<DialogSummonHost />` (rendered once in App.vue) and resolves with the
 * value the dialog passes to `resolve(...)`, or with `undefined` when the
 * dialog is dismissed (cancel button, Escape, overlay click). Dismissal is
 * a resolution, never a rejection — `if (!confirmed) return;` at call sites
 * instead of try/catch.
 *
 * Contract for a summoned component:
 *  - it receives an `open: boolean` prop, binds it to its reka Dialog root
 *    and reports every close path via `update:open(false)`;
 *  - it calls `useSummonedDialog<T>().resolve(value)` to settle with a
 *    meaningful result.
 *
 * After settling, the instance stays mounted for {@link EXIT_ANIMATION_MS}
 * with `open = false`, so the reka dialog plays its exit animation before
 * the node is dropped. Stacking is supported: summoning from inside an open
 * dialog renders the new one on top (reka layers nested modals by mount
 * order), and settling it returns control to the one below.
 */

export interface SummonedDialogController<TResult = unknown> {
  /** `open` prop source for the dialog root; flips to false on settle. */
  open: Readonly<ShallowRef<boolean>>;
  /** Settles with a result and starts the exit animation. */
  resolve: (value: TResult) => void;
  /** Settles with `undefined` — the cancel/Escape/overlay-click path. */
  dismiss: () => void;
}

interface SummonedDialogInstance {
  id: number;
  key: string | undefined;
  component: Component;
  props: Record<string, unknown>;
  controller: SummonedDialogController<unknown>;
  promise: Promise<unknown>;
}

const EXIT_ANIMATION_MS = 300;

const instances = shallowReactive<SummonedDialogInstance[]>([]);
let nextInstanceId = 0;

const summonedDialogKey: InjectionKey<SummonedDialogController<unknown>>
  = Symbol("summoned-dialog");

export interface SummonDialogOptions {
  /** Dedupe key: while a dialog with this key is open, re-summoning it
   *  returns the existing promise instead of stacking a duplicate. */
  key?: string;
}

export const summonDialog = <TResult = void>(
  component: Component,
  props: Record<string, unknown> = {},
  options: SummonDialogOptions = {},
): Promise<TResult | undefined> => {
  const existing = options.key
    ? instances.find(instance => instance.key === options.key)
    : undefined;
  if (existing) return existing.promise as Promise<TResult | undefined>;

  const id = nextInstanceId++;
  const open = shallowRef(true);
  let settled = false;
  let resolvePromise!: (value: TResult | undefined) => void;
  const promise = new Promise<TResult | undefined>((resolve) => {
    resolvePromise = resolve;
  });

  const settle = (value: TResult | undefined) => {
    if (settled) return;
    settled = true;
    open.value = false;
    resolvePromise(value);
    setTimeout(() => {
      const index = instances.findIndex(instance => instance.id === id);
      if (index !== -1) instances.splice(index, 1);
    }, EXIT_ANIMATION_MS);
  };

  const controller: SummonedDialogController<TResult> = {
    open,
    resolve: value => settle(value),
    dismiss: () => settle(undefined),
  };

  instances.push({
    id,
    key: options.key,
    component: markRaw(component),
    props,
    controller: controller as SummonedDialogController<unknown>,
    promise,
  });

  return promise;
};

/** Settles every open summoned dialog with `undefined`. */
export const dismissAllSummonedDialogs = (): void => {
  for (const instance of [...instances]) {
    instance.controller.dismiss();
  }
};

/** Controller of the enclosing summoned dialog. */
export const useSummonedDialog = <TResult = void>(): SummonedDialogController<TResult> => {
  const controller = inject(summonedDialogKey, null);
  if (!controller) {
    throw new Error("useSummonedDialog() must be used inside a dialog rendered by <DialogSummonHost />");
  }
  return controller as SummonedDialogController<TResult>;
};

// eslint-disable-next-line vue/one-component-per-file -- the per-instance provider only exists for the host below
const SummonedDialog = defineComponent({
  name: "SummonedDialog",
  props: {
    instance: {
      type: Object as PropType<SummonedDialogInstance>,
      required: true,
    },
  },
  setup(props) {
    provide(summonedDialogKey, props.instance.controller);
    return () => h(props.instance.component, {
      ...props.instance.props,
      "open": props.instance.controller.open.value,
      "onUpdate:open": (value: boolean) => {
        if (!value) props.instance.controller.dismiss();
      },
    });
  },
});

/** Mounted once near the app root; renders every summoned dialog. */
// eslint-disable-next-line vue/one-component-per-file -- host + provider are one unit
export const DialogSummonHost = defineComponent({
  name: "DialogSummonHost",
  setup() {
    return () => instances.map(instance =>
      h(SummonedDialog, { key: instance.id, instance }),
    );
  },
});
