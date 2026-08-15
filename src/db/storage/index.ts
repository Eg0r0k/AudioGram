import { platformCaps } from "@/lib/environment/platformCaps";
import { IFileStorage } from "./IFileStorage";
import { TauriStorage } from "./tauri.storage";
import { WebOpfsStorage } from "./web-opfs.storage";

export const storageService: IFileStorage = platformCaps.hasFs
  ? new TauriStorage()
  : new WebOpfsStorage();
