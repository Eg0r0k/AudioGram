declare const __brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand;
};

export function createId<T extends string>(id: string): T {
  return id as T;
}

export function isId<T extends string>(value: unknown): value is T {
  return typeof value === "string" && value.length > 0;
}
