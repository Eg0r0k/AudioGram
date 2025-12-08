import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { IS_TAURI } from "../environment/userAgent";

export interface OpenedFile {
  path: string;
  name: string;
  data: Uint8Array;
}

export async function listenForOpenedFiles(
  callback: (files: OpenedFile[]) => void,
): Promise<() => void> {
  if (!IS_TAURI) {
    return () => {};
  }
  const unlisten = await listen<string[]>("files-opened", async (event) => {
    const filePaths = event.payload;
    const files: OpenedFile[] = [];

    for (const filePath of filePaths) {
      try {
        const ext = filePath.split(".").pop()?.toLowerCase();
        const audioExtensions = [
          "mp3",
          "wav",
          "flac",
          "ogg",
          "m4a",
          "aac",
          "wma",
        ];

        if (ext && audioExtensions.includes(ext)) {
          const data = await readFile(filePath);
          const name = filePath.split(/[/\\]/).pop() || filePath;

          files.push({ path: filePath, name, data });
        }
      }
      catch (error) {
        console.error(`Failed to read file: ${filePath}`, error);
      }
    }

    if (files.length > 0) {
      callback(files);
    }
  });

  return unlisten;
}

export function openedFileToFile(opened: OpenedFile): File {
  const buffer = new ArrayBuffer(opened.data.length);
  const view = new Uint8Array(buffer);
  view.set(opened.data);

  const blob = new Blob([buffer], { type: getMimeType(opened.name) });
  return new File([blob], opened.name, {
    type: getMimeType(opened.name),
  });
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

// import { listen } from "@tauri-apps/api/event";
// import { readFile } from "@tauri-apps/plugin-fs";

// export interface OpenedFile {
//   path: string;
//   name: string;
//   data: Uint8Array;
// }

// // Глобальный аудио объект для управления воспроизведением
// let currentAudio: HTMLAudioElement | null = null;

// export async function listenForOpenedFiles(
//   callback: (files: OpenedFile[]) => void
// ): Promise<() => void> {
//   const unlisten = await listen<string[]>("files-opened", async (event) => {
//     const filePaths = event.payload;
//     const files: OpenedFile[] = [];

//     for (const filePath of filePaths) {
//       try {
//         const ext = filePath.split(".").pop()?.toLowerCase();
//         const audioExtensions = [
//           "mp3",
//           "wav",
//           "flac",
//           "ogg",
//           "m4a",
//           "aac",
//           "wma",
//         ];

//         if (ext && audioExtensions.includes(ext)) {
//           const data = await readFile(filePath);
//           const name = filePath.split(/[/\\]/).pop() || filePath;

//           files.push({ path: filePath, name, data });
//         }
//       } catch (error) {
//         console.error(`Failed to read file: ${filePath}`, error);
//       }
//     }

//     if (files.length > 0) {
//       callback(files);

//       // Воспроизводим первый файл
//       playAudioFile(files[0]);
//     }
//   });

//   return unlisten;
// }

// export function playAudioFile(file: OpenedFile): void {
//   // Останавливаем предыдущее воспроизведение
//   stopCurrentAudio();

//   // Создаём Blob URL
//   const buffer = new ArrayBuffer(file.data.length);
//   const view = new Uint8Array(buffer);
//   view.set(file.data);

//   const blob = new Blob([buffer], { type: getMimeType(file.name) });
//   const url = URL.createObjectURL(blob);

//   // Создаём и запускаем аудио
//   currentAudio = new Audio(url);

//   currentAudio.onended = () => {
//     URL.revokeObjectURL(url);
//     currentAudio = null;
//   };

//   currentAudio.onerror = (e) => {
//     console.error("Audio playback error:", e);
//     URL.revokeObjectURL(url);
//     currentAudio = null;
//   };

//   currentAudio.play().catch((err) => {
//     console.error("Failed to play audio:", err);
//   });

//   console.log(`▶️ Playing: ${file.name}`);
// }

// export function stopCurrentAudio(): void {
//   if (currentAudio) {
//     currentAudio.pause();
//     currentAudio.src = "";
//     currentAudio = null;
//   }
// }

// export function pauseCurrentAudio(): void {
//   currentAudio?.pause();
// }

// export function resumeCurrentAudio(): void {
//   currentAudio?.play();
// }

// export function getCurrentAudio(): HTMLAudioElement | null {
//   return currentAudio;
// }

// export function openedFileToFile(opened: OpenedFile): File {
//   const buffer = new ArrayBuffer(opened.data.length);
//   const view = new Uint8Array(buffer);
//   view.set(opened.data);

//   const blob = new Blob([buffer], { type: getMimeType(opened.name) });
//   return new File([blob], opened.name, {
//     type: getMimeType(opened.name),
//   });
// }

// function getMimeType(filename: string): string {
//   const ext = filename.split(".").pop()?.toLowerCase();
//   const mimeTypes: Record<string, string> = {
//     mp3: "audio/mpeg",
//     wav: "audio/wav",
//     flac: "audio/flac",
//     ogg: "audio/ogg",
//     m4a: "audio/mp4",
//     aac: "audio/aac",
//     wma: "audio/x-ms-wma",
//   };
//   return mimeTypes[ext || ""] || "application/octet-stream";
// }
