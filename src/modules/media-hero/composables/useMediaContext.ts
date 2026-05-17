import { inject, provide, type InjectionKey } from "vue";

export interface MediaContextActions {
  addToQueue: () => void;
  edit: () => void;
  delete: () => void;
  share: () => void;
}

const MediaContextKey: InjectionKey<MediaContextActions> = Symbol("MediaContext");

export function provideMediaContext(actions: MediaContextActions) {
  provide(MediaContextKey, actions);
}

export function useMediaContext(): MediaContextActions {
  const context = inject(MediaContextKey);
  if (!context) {
    return {
      addToQueue: () => console.warn("addToQueue not implemented"),
      edit: () => console.warn("edit not implemented"),
      delete: () => console.warn("delete not implemented"),
      share: () => console.warn("share not implemented"),
    };
  }
  return context;
}
