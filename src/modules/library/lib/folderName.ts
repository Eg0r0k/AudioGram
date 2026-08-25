// Sidebar folder names follow the shared naming rules (`@/lib/limits`); these
// aliases keep the folder-specific call sites readable.

import { normalizeName } from "@/lib/artist-names";
import { assertValidName, NAME_MAX_LENGTH, validateName, type NameError } from "@/lib/limits";

export const FOLDER_NAME_MAX_LENGTH = NAME_MAX_LENGTH;

export type FolderNameError = NameError;

export const normalizeFolderName = normalizeName;

export const validateFolderName = validateName;

export const assertValidFolderName = (raw: string): string => assertValidName(raw, "folder");
