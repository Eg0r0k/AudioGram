import { getLogger } from "@/lib/logger";
import type { Result } from "neverthrow";

export const unwrapResult = async <T>(
  promise: Promise<Result<T, Error>>,
): Promise<T> => {
  const result = await promise;

  if (result.isErr()) {
    getLogger().error(`[DB] ${result.error.message}`);
    throw result.error;
  }

  return result.value;
};
