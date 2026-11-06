export const sceneKey = "personal-storytelling-scenes-v1";
export const profileKey = "personal-storytelling-profile-v1";
const photoDbName = "storyframe-photos-v1";
const storyListKey = "storyframe-stories-v1";
const activeStoryKey = "storyframe-active-story-v1";
export const pageLimit = 30;

export type StorySummary = { id: string; title: string; owner: string; updatedAt: number };

function getActiveStoryId() {
  return localStorage.getItem(activeStoryKey) || "legacy";
}
function storyStorageKey(key: string, storyId = getActiveStoryId()) {
  return `${key}:${storyId}`;
}
function readStorySummaries(): StorySummary[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storyListKey) || "[]");
    return Array.isArray(value) ? value.filter((item): item is StorySummary => Boolean(item && typeof item.id === "string" && typeof item.title === "string" && typeof item.updatedAt === "number")) : [];
  } catch { return []; }
}
function ensureStoryLibrary(): StorySummary[] {
  const current = readStorySummaries();
  if (current.length) return current;
  const id = "legacy";
  const oldProfile = localStorage.getItem(profileKey);
  const oldScenes = localStorage.getItem(sceneKey);
  if (oldProfile) localStorage.setItem(storyStorageKey(profileKey, id), oldProfile);
  if (oldScenes) localStorage.setItem(storyStorageKey(sceneKey, id), oldScenes);
  const summary = { id, title: "나의 이야기", owner: "", updatedAt: Date.now() };
  localStorage.setItem(storyListKey, JSON.stringify([summary]));
  localStorage.setItem(activeStoryKey, id);
  return [summary];
}
export function listStories() {
  if (typeof window === "undefined") return [];
  return ensureStoryLibrary().sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getActiveStory() {
  const stories = listStories();
  return stories.find((story) => story.id === getActiveStoryId()) || stories[0];
}
export function openStory(id: string) {
  const stories = listStories();
  if (!stories.some((story) => story.id === id)) return false;
  localStorage.setItem(activeStoryKey, id);
  return true;
}
export function createStory() {
  const stories = listStories();
  const story = { id: crypto.randomUUID(), title: "이름 없는 이야기", owner: "", updatedAt: Date.now() };
  localStorage.setItem(storyListKey, JSON.stringify([story, ...stories]));
  localStorage.setItem(activeStoryKey, story.id);
  localStorage.setItem(storyStorageKey(profileKey, story.id), JSON.stringify(emptyProfile));
  localStorage.setItem(storyStorageKey(sceneKey, story.id), JSON.stringify([emptyScene()]));
  return story;
}
export function importStory(profile: Profile, scenes: Scene[]) {
  const id = crypto.randomUUID();
  const safeScenes = (Array.isArray(scenes) ? scenes : []).slice(0, pageLimit).map((scene) => ({ ...emptyScene(), ...scene, id: crypto.randomUUID() }));
  const safeProfile = { ...emptyProfile, ...profile };
  const story = {
    id,
    title: safeProfile.title.trim().split("\n")[0] || safeProfile.name.trim() || "이름 없는 이야기",
    owner: safeProfile.name.trim(),
    updatedAt: Date.now(),
  };
  const stories = listStories();
  localStorage.setItem(storyListKey, JSON.stringify([story, ...stories]));
  localStorage.setItem(activeStoryKey, id);
  localStorage.setItem(storyStorageKey(profileKey, id), JSON.stringify(safeProfile));
  localStorage.setItem(storyStorageKey(sceneKey, id), JSON.stringify(safeScenes.length ? safeScenes : [emptyScene()]));
  return story;
}
export function renameStory(id: string, title: string) {
  const safeTitle = title.trim().slice(0, 80) || "이름 없는 이야기";
  const next = listStories().map((story) => story.id === id ? { ...story, title: safeTitle, updatedAt: Date.now() } : story);
  localStorage.setItem(storyListKey, JSON.stringify(next));
  try {
    const key = storyStorageKey(profileKey, id);
    const profile = JSON.parse(localStorage.getItem(key) || "{}");
    if (profile && typeof profile === "object") localStorage.setItem(key, JSON.stringify({ ...profile, title: safeTitle }));
  } catch { /* Keep the renamed library title even if the document is malformed. */ }
}
export async function deleteStory(id: string) {
  const stories = listStories();
  if (stories.length <= 1 || !stories.some((story) => story.id === id)) return false;
  const remaining = stories.filter((story) => story.id !== id);
  localStorage.setItem(storyListKey, JSON.stringify(remaining));
  localStorage.removeItem(storyStorageKey(profileKey, id));
  localStorage.removeItem(storyStorageKey(sceneKey, id));
  if (getActiveStoryId() === id) localStorage.setItem(activeStoryKey, remaining[0].id);
  try {
    const db = await openPhotoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      const request = tx.objectStore("photos").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${id}:`) || (id === "legacy" && (cursor.key === "cover" || typeof cursor.key === "number"))) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch { /* Browser photo storage may be unavailable; text data is still removed. */ }
  if (id === "legacy") {
    localStorage.removeItem(profileKey);
    localStorage.removeItem(sceneKey);
  }
  return true;
}

export type PhotoKey = number | "cover";
export type PhotoFit = "cover" | "contain";
export type MediaRatio = "balanced" | "text" | "photo";
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxPhotoBytes = 20 * 1024 * 1024;
const maxDecodedPixels = 40_000_000;
export async function isSupportedPhotoFile(file: File): Promise<boolean> {
  if (!allowedPhotoTypes.has(file.type) || file.size > maxPhotoBytes) return false;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (file.type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte);
  if (file.type === "image/webp") return String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  return String.fromCharCode(...header.slice(4, 8)) === "ftyp"
    && ["avif", "avis"].includes(String.fromCharCode(...header.slice(8, 12)));
}
export type PaletteColor = { id: string; color: string };
export const defaultPalette: PaletteColor[] = [
  { id: "fog", color: "#EEF1F5" }, { id: "sky", color: "#DFE8F3" },
  { id: "sage", color: "#E1EAE5" }, { id: "sand", color: "#F1E5D9" },
  { id: "lilac", color: "#E9E3F0" }, { id: "night", color: "#27313E" },
];
const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const legacySceneColors: Record<string, string> = {
  "story-card-dark": "#272B31", "story-card-lilac": "#DCD5E9",
  "story-card-warm": "#EAD3B7", "story-card-now": "#776D8C",
};
const legacyCoverColors: Record<string, string> = {
  dark: "#272B31", warm: "#EAD0AD", lilac: "#DED7E9", plum: "#766C88",
};
export function resolveBackground(choice: string, palette: PaletteColor[], fallback: string) {
  if (choice.startsWith("palette:")) return palette.find((entry) => entry.id === choice.slice(8))?.color || fallback;
  return isColor(choice) ? choice : fallback;
}
export type Scene = {
  id: string;
  year: string;
  label: string;
  title: string;
  description: string;
  theme: string;
  background: string;
  mediaRatio: MediaRatio;
  photoFit: PhotoFit;
  photoX: number;
  photoY: number;
};
export type Profile = {
  name: string;
  title: string;
  description: string;
  accentColor: string;
  palette: PaletteColor[];
  coverBackground: string;
  endingBackground: string;
  endingTitle: string;
  endingDescription: string;
  coverTheme: string;
  coverLayout: "split" | "background";
  coverAlign: "left" | "center";
  coverPhotoFit: PhotoFit;
  coverPhotoX: number;
  coverPhotoY: number;
};

export const emptyScene = (): Scene => ({
  id: crypto.randomUUID(), year: "", label: "", title: "", description: "", theme: "",
  background: "palette:fog",
  mediaRatio: "balanced", photoFit: "cover", photoX: 50, photoY: 50,
});
export const emptyProfile: Profile = {
  name: "", title: "", description: "", endingTitle: "", endingDescription: "",
  accentColor: "#52657d",
  palette: defaultPalette.map((entry) => ({ ...entry })),
  coverBackground: "palette:fog", endingBackground: "palette:sky",
  coverTheme: "", coverLayout: "split", coverAlign: "left", coverPhotoFit: "cover", coverPhotoX: 50, coverPhotoY: 50,
};

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
export function loadDocument(storyId = getActiveStoryId()): { scenes: Scene[]; profile: Profile } {
  ensureStoryLibrary();
  const savedScenes = readJson(storyStorageKey(sceneKey, storyId));
  const scenes = Array.isArray(savedScenes) && savedScenes.length
    ? savedScenes.slice(0, pageLimit).map((value: unknown) => {
      const source = value && typeof value === "object" ? value as Partial<Scene> : {};
      return {
        ...emptyScene(), ...source,
        id: typeof source.id === "string" ? source.id : crypto.randomUUID(),
        background: typeof source.background === "string" ? source.background : legacySceneColors[source.theme || ""] || "palette:fog",
      };
    })
    : [emptyScene()];
  const savedProfile = readJson(storyStorageKey(profileKey, storyId));
  const sourceProfile = savedProfile && typeof savedProfile === "object" ? savedProfile as Partial<Profile> : {};
  const profile = { ...emptyProfile, ...sourceProfile };
  if (!/^#[0-9a-fA-F]{6}$/.test(profile.accentColor)) profile.accentColor = emptyProfile.accentColor;
  profile.palette = Array.isArray(profile.palette)
    ? profile.palette.slice(0, 12).filter((entry): entry is PaletteColor => Boolean(entry && typeof entry.id === "string" && /^[a-zA-Z0-9-]{1,50}$/.test(entry.id) && isColor(entry.color)))
    : defaultPalette.map((entry) => ({ ...entry }));
  if (!profile.palette.length) profile.palette = defaultPalette.map((entry) => ({ ...entry }));
  profile.coverBackground = typeof sourceProfile.coverBackground === "string" ? sourceProfile.coverBackground : legacyCoverColors[profile.coverTheme] || "palette:fog";
  profile.endingBackground = typeof sourceProfile.endingBackground === "string" ? sourceProfile.endingBackground : "palette:sky";
  const oldDefaults: Partial<Profile> = {
    name: "나의 이야기", title: "나의 이야기를\n만들어보세요.",
    description: "기억하고 싶은 순간을 한 장씩 담아보세요.",
    endingTitle: "이야기는 계속됩니다.", endingDescription: "다음 장면을 기다리며.",
  };
  for (const [key, value] of Object.entries(oldDefaults)) {
    const field = key as keyof Profile;
    if (profile[field] === value) Object.assign(profile, { [field]: "" });
  }
  return { scenes, profile };
}
export function saveDocument(scenes: Scene[], profile: Profile): boolean {
  try {
    const id = getActiveStoryId();
    localStorage.setItem(storyStorageKey(sceneKey, id), JSON.stringify(scenes));
    localStorage.setItem(storyStorageKey(profileKey, id), JSON.stringify(profile));
    const summaries = ensureStoryLibrary().map((story) => story.id === id
      ? { ...story, title: profile.title.trim().split("\n")[0] || profile.name.trim() || "이름 없는 이야기", owner: profile.name.trim(), updatedAt: Date.now() }
      : story);
    localStorage.setItem(storyListKey, JSON.stringify(summaries));
    return true;
  } catch { return false; }
}

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("사진 저장을 지원하지 않습니다"));
    const request = indexedDB.open(photoDbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("photos")) request.result.createObjectStore("photos");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadPhotos(count: number, storyId = getActiveStoryId()): Promise<Map<PhotoKey, Blob>> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const keys: PhotoKey[] = ["cover", ...Array.from({ length: count }, (_, index) => index)];
    const requests = keys.map((key) => store.get(`${storyId}:${key}`));
    const legacyRequests = storyId === "legacy" ? keys.map((key) => store.get(key)) : [];
    tx.oncomplete = () => {
      db.close();
      const result = new Map<PhotoKey, Blob>();
      requests.forEach((request, index) => {
        const blob = request.result instanceof Blob ? request.result : legacyRequests[index]?.result;
        if (blob instanceof Blob) result.set(keys[index], blob);
      });
      resolve(result);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function putPhoto(key: PhotoKey, blob: Blob, storyId = getActiveStoryId()): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(blob, `${storyId}:${key}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function removePhoto(key: PhotoKey, storyId = getActiveStoryId()): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(`${storyId}:${key}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function rewriteScenePhotos(order: number[], oldCount: number): Promise<Map<PhotoKey, Blob>> {
  const current = await loadPhotos(oldCount);
  const next = new Map<PhotoKey, Blob>();
  const cover = current.get("cover");
  if (cover) next.set("cover", cover);
  order.forEach((oldIndex, newIndex) => {
    const blob = current.get(oldIndex);
    if (blob) next.set(newIndex, blob);
  });
  const db = await openPhotoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    const storyId = getActiveStoryId();
    for (let index = 0; index < oldCount; index++) {
      const blob = next.get(index);
      if (blob) store.put(blob, `${storyId}:${index}`);
      else store.delete(`${storyId}:${index}`);
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
  return next;
}

export async function compressPhoto(file: File): Promise<Blob> {
  if (!(await isSupportedPhotoFile(file))) {
    throw new Error("20MB 이하의 JPG, PNG, WebP 또는 AVIF 사진만 사용할 수 있습니다");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > maxDecodedPixels) {
      throw new Error("사진의 해상도가 너무 큽니다");
    }
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 처리할 수 없습니다");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진 처리 실패")), "image/webp", .86));
  } finally { URL.revokeObjectURL(url); }
}
