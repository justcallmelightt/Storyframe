export const sceneKey = "personal-storytelling-scenes-v1";
export const profileKey = "personal-storytelling-profile-v1";
const photoDbName = "storyframe-photos-v1";
export const pageLimit = 30;

export type PhotoKey = number | "cover";
export type PhotoFit = "cover" | "contain";
export type MediaRatio = "balanced" | "text" | "photo";
export type Scene = {
  id: string;
  year: string;
  label: string;
  title: string;
  description: string;
  theme: string;
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
  mediaRatio: "balanced", photoFit: "cover", photoX: 50, photoY: 50,
});
export const emptyProfile: Profile = {
  name: "", title: "", description: "", endingTitle: "", endingDescription: "",
  accentColor: "#52657d",
  coverTheme: "", coverLayout: "split", coverAlign: "left", coverPhotoFit: "cover", coverPhotoX: 50, coverPhotoY: 50,
};

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
export function loadDocument(): { scenes: Scene[]; profile: Profile } {
  const savedScenes = readJson(sceneKey);
  const scenes = Array.isArray(savedScenes) && savedScenes.length
    ? savedScenes.slice(0, pageLimit).map((value: unknown) => {
      const source = value && typeof value === "object" ? value as Partial<Scene> : {};
      return { ...emptyScene(), ...source, id: typeof source.id === "string" ? source.id : crypto.randomUUID() };
    })
    : [emptyScene()];
  const savedProfile = readJson(profileKey);
  const profile = { ...emptyProfile, ...(savedProfile && typeof savedProfile === "object" ? savedProfile as Partial<Profile> : {}) };
  if (!/^#[0-9a-fA-F]{6}$/.test(profile.accentColor)) profile.accentColor = emptyProfile.accentColor;
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
    localStorage.setItem(sceneKey, JSON.stringify(scenes));
    localStorage.setItem(profileKey, JSON.stringify(profile));
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
export async function loadPhotos(count: number): Promise<Map<PhotoKey, Blob>> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const keys: PhotoKey[] = ["cover", ...Array.from({ length: count }, (_, index) => index)];
    const requests = keys.map((key) => store.get(key));
    tx.oncomplete = () => {
      db.close();
      const result = new Map<PhotoKey, Blob>();
      requests.forEach((request, index) => { if (request.result instanceof Blob) result.set(keys[index], request.result); });
      resolve(result);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function putPhoto(key: PhotoKey, blob: Blob): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function removePhoto(key: PhotoKey): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(key);
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
    for (let index = 0; index < oldCount; index++) {
      const blob = next.get(index);
      if (blob) store.put(blob, index);
      else store.delete(index);
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
  return next;
}

export async function compressPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
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
