"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ChangeEvent, type PointerEvent, type KeyboardEvent } from "react";
import Link from "next/link";
/* Blob URLs are local browser images; next/image cannot optimize or serve them. */
/* eslint-disable @next/next/no-img-element */
import {
  compressPhoto, emptyProfile, emptyScene, loadDocument, loadPhotos, pageLimit, putPhoto,
  removePhoto, resolveBackground, rewriteScenePhotos, saveDocument,
  type MediaRatio, type PaletteColor, type PhotoFit, type PhotoKey, type Profile, type Scene,
} from "@/lib/storyframe-storage";

const themes: Record<string, string> = {
  "story-card-dark": "theme-dark", "story-card-lilac": "theme-lilac",
  "story-card-warm": "theme-warm", "story-card-now": "theme-plum",
};
function readableAccent(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  const background = .92;
  for (let blend = 0; blend <= 1; blend += .05) {
    const darkened = channels.map((channel) => Math.round(channel * (1 - blend)));
    const value = .2126 * linear(darkened[0]) + .7152 * linear(darkened[1]) + .0722 * linear(darkened[2]);
    if ((background + .05) / (value + .05) >= 4.5) return `#${darkened.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#1d1d1f";
}
function backgroundInk(hex: string) {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return luminance > .22 ? "#1d1d1f" : "#ffffff";
}
function applyHexInput(event: React.FocusEvent<HTMLInputElement>, current: string, onValid: (color: string) => void) {
  const color = event.currentTarget.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) onValid(color.toUpperCase());
  else event.currentTarget.value = current.toUpperCase();
}
type BackgroundPickerProps = {
  value: string; palette: PaletteColor[]; fallback: string;
  onSelect: (value: string) => void;
  onPaletteChange: (id: string, color: string) => void;
  onPaletteAdd: () => void;
  onPaletteRemove: (id: string) => void;
};
function BackgroundPicker({ value, palette, fallback, onSelect, onPaletteChange, onPaletteAdd, onPaletteRemove }: BackgroundPickerProps) {
  const selectedColor = resolveBackground(value, palette, fallback);
  return <div className="background-picker">
    <div className="picker-heading"><strong>페이지 배경</strong><span>색을 누르면 바로 적용됩니다</span></div>
    <div className="palette-swatches" role="group" aria-label="배경색 팔레트">
      {palette.map((entry, index) => <button key={entry.id} className={`palette-swatch${value === `palette:${entry.id}` ? " selected" : ""}`} type="button" aria-label={`팔레트 ${index + 1}: ${entry.color}`} aria-pressed={value === `palette:${entry.id}`} style={{ backgroundColor: entry.color }} onClick={() => onSelect(`palette:${entry.id}`)} />)}
    </div>
    <label className="custom-background">직접 선택<div className="custom-background-inputs"><input type="color" aria-label="페이지 배경 직접 선택" value={selectedColor} onChange={(event) => onSelect(event.target.value)} /><input key={selectedColor} className="hex-input" type="text" inputMode="text" maxLength={7} defaultValue={selectedColor.toUpperCase()} aria-label="페이지 배경 HEX 코드" onBlur={(event) => applyHexInput(event, selectedColor, onSelect)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div></label>
    <details className="palette-editor"><summary>팔레트 색 편집</summary>
      <p>팔레트 색을 바꾸면 사용 중인 페이지에도 적용됩니다.</p>
      <div className="palette-edit-list">{palette.map((entry, index) => <div key={entry.id} className="palette-edit-row"><label>색 {index + 1}<input type="color" aria-label={`팔레트 색 ${index + 1} 수정`} value={entry.color} onChange={(event) => onPaletteChange(entry.id, event.target.value)} /></label><input key={entry.color} className="hex-input" type="text" inputMode="text" maxLength={7} defaultValue={entry.color.toUpperCase()} aria-label={`팔레트 색 ${index + 1} HEX 코드`} onBlur={(event) => applyHexInput(event, entry.color, (color) => onPaletteChange(entry.id, color))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><button type="button" aria-label={`팔레트 색 ${index + 1} 삭제`} disabled={palette.length === 1} onClick={() => onPaletteRemove(entry.id)}>삭제</button></div>)}</div>
      <button className="palette-add" type="button" disabled={palette.length >= 12} onClick={onPaletteAdd}>＋ 팔레트 색 추가</button>
    </details>
  </div>;
}
const springs = new WeakMap<HTMLElement, { frame: number; offset: number; velocity: number }>();
function cancelSpring(node: HTMLElement) {
  const spring = springs.get(node);
  if (!spring) return { offset: 0, velocity: 0 };
  cancelAnimationFrame(spring.frame);
  springs.delete(node);
  return { offset: spring.offset, velocity: spring.velocity };
}
function springToRest(node: HTMLElement, start: number, initialVelocity = 0) {
  cancelSpring(node);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.style.transform = "";
    node.style.opacity = "0";
    node.style.transition = "opacity .15s ease-out";
    requestAnimationFrame(() => { node.style.opacity = "1"; });
    node.addEventListener("transitionend", () => { node.style.opacity = ""; node.style.transition = ""; }, { once: true });
    return;
  }
  const omega = 2 * Math.PI / .36;
  const damping = Math.abs(initialVelocity) > 850 ? .8 : 1;
  let offset = start;
  let velocity = initialVelocity;
  let last = performance.now();
  const spring = { frame: 0, offset, velocity };
  springs.set(node, spring);
  const frame = (time: number) => {
    const dt = Math.min((time - last) / 1000, .032);
    last = time;
    velocity += (-omega * omega * offset - 2 * damping * omega * velocity) * dt;
    offset += velocity * dt;
    spring.offset = offset;
    spring.velocity = velocity;
    node.style.transform = `translate3d(0, ${offset}px, 0)`;
    if (Math.abs(offset) > .45 || Math.abs(velocity) > 4) spring.frame = requestAnimationFrame(frame);
    else { node.style.transform = ""; springs.delete(node); }
  };
  spring.frame = requestAnimationFrame(frame);
}
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { queueMicrotask(() => setUrl(undefined)); return; }
    const next = URL.createObjectURL(blob);
    let live = true;
    queueMicrotask(() => { if (live) setUrl(next); });
    return () => { live = false; URL.revokeObjectURL(next); };
  }, [blob]);
  return url;
}
function Textarea({ value, onChange, ...props }: { value: string; onChange?: (value: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight + 2, 300)}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(event) => onChange?.(event.target.value)} {...props} />;
}
type PendingPhoto = { file: File; key: PhotoKey; url: string };
type DragState = {
  article: HTMLElement; handle: HTMLElement; pointerId: number; from: number; target: number;
  rect: DOMRect; startY: number; clientY: number; startScroll: number; baseOffset: number;
  lastY: number; lastTime: number; velocity: number; frame: number;
};

export function StoryframeApp({ readOnly = false }: { readOnly?: boolean }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [photos, setPhotos] = useState<Map<PhotoKey, Blob>>(new Map());
  const [status, setStatus] = useState("이 브라우저에 저장됨");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [pendingFit, setPendingFit] = useState<PhotoFit>("cover");
  const [pendingX, setPendingX] = useState(50);
  const [pendingY, setPendingY] = useState(50);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const flipRef = useRef<{ tops: Map<string, number>; velocity: number; movedId: string; target: number } | null>(null);
  const coverUrl = useBlobUrl(photos.get("cover"));

  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      const document = loadDocument();
      setScenes(document.scenes);
      setProfile(document.profile);
      setReady(true);
      loadPhotos(document.scenes.length).then((stored) => { if (live) setPhotos(stored); }).catch(() => {
        if (live) setStatus("사진 저장 공간을 열지 못했습니다");
      });
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (ready && !readOnly && !saveDocument(scenes, profile)) queueMicrotask(() => setStatus("저장 공간을 사용할 수 없습니다"));
  }, [ready, readOnly, scenes, profile]);
  useEffect(() => {
    if (readOnly && ready) document.title = `${profile.title.trim().split("\n")[0] || "나의 이야기"} — STORYFRAME`;
  }, [readOnly, ready, profile.title]);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);
  useLayoutEffect(() => {
    const flip = flipRef.current;
    if (!flip || !listRef.current) return;
    flipRef.current = null;
    for (const node of Array.from(listRef.current.children) as HTMLElement[]) {
      const oldTop = flip.tops.get(node.dataset.id || "");
      if (oldTop === undefined) continue;
      const offset = oldTop - node.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) springToRest(node, offset, node.dataset.id === flip.movedId ? flip.velocity : 0);
    }
    (listRef.current.children[flip.target] as HTMLElement)?.querySelector<HTMLElement>(".drag-handle")?.focus({ preventScroll: true });
  }, [scenes]);

  const changeProfile = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const updatePaletteColor = (id: string, color: string) => setProfile((current) => ({
    ...current, palette: current.palette.map((entry) => entry.id === id ? { ...entry, color } : entry),
  }));
  const addPaletteColor = () => setProfile((current) => current.palette.length >= 12 ? current : ({
    ...current, palette: [...current.palette, { id: crypto.randomUUID(), color: "#DDE6F3" }],
  }));
  const removePaletteColor = (id: string) => {
    const entry = profile.palette.find((item) => item.id === id);
    if (!entry || profile.palette.length <= 1) return;
    const selected = `palette:${id}`;
    setProfile((current) => ({
      ...current, palette: current.palette.filter((item) => item.id !== id),
      coverBackground: current.coverBackground === selected ? entry.color : current.coverBackground,
      endingBackground: current.endingBackground === selected ? entry.color : current.endingBackground,
    }));
    setScenes((current) => current.map((scene) => scene.background === selected ? { ...scene, background: entry.color } : scene));
  };
  const selectSceneBackground = (id: string, background: string) => setScenes((current) => current.map((scene) =>
    scene.id === id ? { ...scene, background, theme: "" } : scene));
  const changeScene = <K extends keyof Scene>(id: string, key: K, value: Scene[K]) => {
    setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, [key]: value } : scene));
  };
  const photoChanged = (event: ChangeEvent<HTMLInputElement>, key: PhotoKey) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setStatus("20MB 이하의 사진을 선택해 주세요");
      return;
    }
    const url = URL.createObjectURL(file);
    setPending({ file, key, url });
    setPendingFit("cover"); setPendingX(50); setPendingY(50);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };
  const closePhoto = () => { dialogRef.current?.close(); setPending(null); };
  const savePhoto = async () => {
    if (!pending || busy) return;
    setBusy(true); setStatus("사진 저장 중…");
    try {
      const blob = await compressPhoto(pending.file);
      await putPhoto(pending.key, blob);
      setPhotos((current) => new Map(current).set(pending.key, blob));
      if (pending.key === "cover") {
        setProfile((current) => ({ ...current, coverPhotoFit: pendingFit, coverPhotoX: pendingX, coverPhotoY: pendingY }));
      } else {
        const id = scenes[pending.key]?.id;
        if (id) setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, photoFit: pendingFit, photoX: pendingX, photoY: pendingY } : scene));
      }
      closePhoto(); setStatus("사진이 이 브라우저에 저장됨");
    } catch { setStatus("사진을 저장하지 못했습니다"); }
    finally { setBusy(false); }
  };
  const deletePhoto = async (key: PhotoKey) => {
    if (busy) return;
    setBusy(true);
    try {
      await removePhoto(key);
      setPhotos((current) => { const next = new Map(current); next.delete(key); return next; });
      setStatus("사진이 제거됨");
    } catch { setStatus("사진을 제거하지 못했습니다"); }
    finally { setBusy(false); }
  };
  const changeOrder = async (from: number, to: number, velocity = 0) => {
    if (readOnly || busy || from === to || to < 0 || to >= scenes.length) return;
    setBusy(true);
    const order = scenes.map((_, index) => index);
    order.splice(to, 0, order.splice(from, 1)[0]);
    const tops = new Map<string, number>();
    for (const node of Array.from(listRef.current?.children || []) as HTMLElement[]) tops.set(node.dataset.id || "", node.getBoundingClientRect().top);
    try {
      const nextPhotos = await rewriteScenePhotos(order, scenes.length);
      const movedId = scenes[from].id;
      flipRef.current = { tops, velocity, movedId, target: to };
      setPhotos(nextPhotos);
      setScenes(order.map((index) => scenes[index]));
      setStatus(`${from + 1}번째 장면을 ${to + 1}번째로 옮겼습니다`);
    } catch {
      const node = listRef.current?.children[from] as HTMLElement | undefined;
      if (node) springToRest(node, 0);
      setStatus("장면 순서를 저장하지 못했습니다");
    } finally { setBusy(false); }
  };
  const deleteScene = async (index: number) => {
    if (busy || scenes.length <= 1) return;
    const id = scenes[index].id;
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setBusy(true);
    try {
      const order = scenes.map((_, position) => position).filter((position) => position !== index);
      const nextPhotos = await rewriteScenePhotos(order, scenes.length);
      setPhotos(nextPhotos); setScenes(order.map((position) => scenes[position]));
      setConfirmDelete(null); setStatus("장면이 삭제됨");
    } catch { setStatus("장면을 삭제하지 못했습니다"); }
    finally { setBusy(false); }
  };
  const targetFor = (state: DragState, y: number) => Array.from(listRef.current?.children || []).filter((node) => node !== state.article).filter((node) => {
    const article = node as HTMLElement;
    const rect = article.getBoundingClientRect();
    const threshold = rect.top + rect.height * (Number(article.dataset.index) < state.from ? .75 : .25);
    return threshold < y;
  }).length;
  const clearMarkers = () => listRef.current?.querySelectorAll(".drop-before,.drop-after").forEach((node) => node.classList.remove("drop-before", "drop-after"));
  const updateDrag = () => {
    const state = dragRef.current;
    if (!state) return;
    const distance = state.baseOffset + state.clientY - state.startY + scrollY - state.startScroll;
    state.article.style.transform = `translate3d(0, ${distance}px, 0)`;
    state.target = targetFor(state, state.clientY);
    clearMarkers();
    const others = Array.from(listRef.current?.children || []).filter((node) => node !== state.article);
    if (others[state.target]) others[state.target].classList.add("drop-before");
    else others.at(-1)?.classList.add("drop-after");
  };
  const autoScroll = () => {
    const state = dragRef.current;
    if (!state) return;
    const edge = 90;
    const speed = state.clientY < edge ? -Math.min(18, (edge - state.clientY) * .25) : state.clientY > innerHeight - edge ? Math.min(18, (state.clientY - innerHeight + edge) * .25) : 0;
    if (speed) { scrollBy(0, speed); updateDrag(); }
    state.frame = requestAnimationFrame(autoScroll);
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (busy || readOnly || dragRef.current || event.button !== 0) return;
    const handle = event.currentTarget;
    const article = handle.closest<HTMLElement>(".story-scene");
    if (!article) return;
    const rect = article.getBoundingClientRect();
    const presentation = cancelSpring(article);
    dragRef.current = {
      article, handle, pointerId: event.pointerId, from: index, target: index, rect,
      startY: event.clientY, clientY: event.clientY, startScroll: scrollY, baseOffset: presentation.offset,
      lastY: event.clientY, lastTime: event.timeStamp, velocity: presentation.velocity, frame: 0,
    };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    article.classList.add("is-dragging");
    dragRef.current.frame = requestAnimationFrame(autoScroll);
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dt = Math.max(1, event.timeStamp - state.lastTime);
    const immediateVelocity = (event.clientY - state.lastY) / dt * 1000;
    state.velocity = state.velocity * .55 + immediateVelocity * .45;
    state.lastY = event.clientY; state.lastTime = event.timeStamp; state.clientY = event.clientY;
    updateDrag();
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    cancelAnimationFrame(state.frame);
    if (state.handle.hasPointerCapture(event.pointerId)) state.handle.releasePointerCapture(event.pointerId);
    state.article.classList.remove("is-dragging"); clearMarkers();
    if (!cancelled && Math.abs(state.velocity) > 850) {
      const endpoint = state.clientY + (state.velocity / 1000) * .998 / (1 - .998);
      state.target = targetFor(state, Math.max(0, Math.min(innerHeight, endpoint)));
    }
    if (cancelled || state.target === state.from) {
      springToRest(state.article, state.baseOffset + state.clientY - state.startY + scrollY - state.startScroll, state.velocity);
    } else changeOrder(state.from, state.target, state.velocity);
  };
  const keyboardDrag = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    void changeOrder(index, Math.min(scenes.length - 1, Math.max(0, index + (event.key === "ArrowUp" ? -1 : 1))));
  };
  const paletteControls = {
    palette: profile.palette, onPaletteChange: updatePaletteColor,
    onPaletteAdd: addPaletteColor, onPaletteRemove: removePaletteColor,
  };
  const coverBackground = resolveBackground(profile.coverBackground, profile.palette, "#EEF1F5");
  const endingBackground = resolveBackground(profile.endingBackground, profile.palette, "#E8ECF1");

  if (!ready) return <main className="storyframe-app storyframe-loading">이야기를 여는 중…</main>;
  return <div className={`storyframe-app${readOnly ? " read-mode" : ""}`} style={{ "--accent-color": profile.accentColor, "--accent-ink": readableAccent(profile.accentColor) } as CSSProperties}>
    <a className="skip-link" href="#storyWebsite">{readOnly ? "이야기 본문으로 건너뛰기" : "이야기 편집으로 건너뛰기"}</a>
    <header className="app-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="STORYFRAME 첫 화면">STORYFRAME</Link>
      <span className="header-purpose">{readOnly ? "독자 화면" : "나의 이야기 웹사이트 만들기"}</span>
      <div className="header-actions">{!readOnly && <label className="accent-picker">대표색<input type="color" aria-label="대표색 선택" value={profile.accentColor} onChange={(event) => changeProfile("accentColor", event.target.value)} /></label>}<span id="saveStatus" role="status" hidden={readOnly}>{status}</span><Link className="read-link" href={readOnly ? "/" : "/story"}>{readOnly ? "내 이야기 편집하기 ↗" : <>독자 화면에서 읽기 <span aria-hidden="true">↗</span></>}</Link></div>
    </div></header>
    <main>
      {!readOnly && <div className="site-intro"><div><h1>당신의 순간을 <em>하나의 웹 이야기</em>로.</h1><p>표지와 시간순 장면을 채우면, 아래로 스크롤하며 읽는 개인 웹사이트가 됩니다. 각 페이지 오른쪽 위의 ‘꾸미기’에서 배경과 사진을 바꿀 수 있습니다.</p></div></div>}
      <div className="site-frame" id="storyWebsite">
        {!readOnly && <div className="site-frame-bar"><span className="site-frame-domain">나의 이야기 · 웹페이지 편집 중</span><span className="site-frame-scroll">각 페이지의 ‘꾸미기’에서 배경색 선택</span></div>}
        <section className={`story-cover cover-${profile.coverTheme || "ivory"} layout-${profile.coverLayout} align-${profile.coverAlign}`} aria-label="이야기 표지" style={{ backgroundColor: coverBackground, color: coverUrl && profile.coverLayout === "background" ? "#ffffff" : backgroundInk(coverBackground) }}>
          {coverUrl && <div className="cover-photo" id="coverPhoto"><img id="coverImage" src={coverUrl} alt="표지에 넣은 사진" style={{ objectFit: profile.coverPhotoFit, objectPosition: `${profile.coverPhotoX}% ${profile.coverPhotoY}%` }} /></div>}
          <div className="cover-content">
            <input id="profileName" maxLength={24} aria-label="표지에 표시할 이름" placeholder="이름 또는 별명" value={profile.name} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(event) => changeProfile("name", event.target.value)} />
            <Textarea id="profileTitle" rows={2} maxLength={80} aria-label="이야기 제목" placeholder="이야기의 제목을 적어주세요" value={profile.title} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => changeProfile("title", value)} />
            <Textarea id="profileDescription" rows={2} maxLength={200} aria-label="이야기 소개" placeholder="이 이야기를 소개하는 한두 문장" value={profile.description} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => changeProfile("description", value)} />
          </div>
          {!readOnly && <div className="cover-tools">
            <label className="cover-upload">＋ 표지 사진 선택<input id="coverFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => photoChanged(event, "cover")} /></label>
            <details className="cover-options"><summary>이 페이지 꾸미기</summary><div className="cover-options-panel">
              <BackgroundPicker {...paletteControls} value={profile.coverBackground} fallback="#EEF1F5" onSelect={(background) => setProfile((current) => ({ ...current, coverBackground: background, coverTheme: "" }))} />
              <label>사진 배치<select id="coverLayout" value={profile.coverLayout} onChange={(event) => changeProfile("coverLayout", event.target.value as Profile["coverLayout"])}><option value="split">글 옆에 사진</option><option value="background">사진을 배경으로</option></select></label>
              <label>글 정렬<select id="coverAlign" value={profile.coverAlign} onChange={(event) => changeProfile("coverAlign", event.target.value as Profile["coverAlign"])}><option value="left">왼쪽</option><option value="center">가운데</option></select></label>
              {coverUrl && <button id="removeCoverPhoto" type="button" onClick={() => void deletePhoto("cover")}>표지 사진 제거</button>}
            </div></details>
          </div>}
        </section>
        <section className="story-chapters" aria-labelledby="chaptersTitle"><div className="chapter-heading"><h2 id="chaptersTitle">기억하고 싶은 순간들</h2>{!readOnly && <p>각 장면이 이야기의 한 구간이 됩니다. 오른쪽 위 손잡이를 끌어 순서를 바꿀 수 있어요.</p>}</div>
          <div id="sceneList" className="scene-list" ref={listRef} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)}>
            {scenes.map((scene, index) => <SceneCard key={scene.id} scene={scene} index={index} count={scenes.length} blob={photos.get(index)} readOnly={readOnly} confirmDelete={confirmDelete === scene.id} palette={profile.palette} onPaletteChange={updatePaletteColor} onPaletteAdd={addPaletteColor} onPaletteRemove={removePaletteColor} onBackgroundChange={(background) => selectSceneBackground(scene.id, background)} onChange={(key, value) => changeScene(scene.id, key, value)} onPhotoChange={(event) => photoChanged(event, index)} onPhotoDelete={() => void deletePhoto(index)} onDelete={() => void deleteScene(index)} onDragStart={(event) => startDrag(event, index)} onDragKey={(event) => keyboardDrag(event, index)} />)}
          </div>
          {!readOnly && scenes.length < pageLimit && <button id="addScene" className="add-scene" type="button" disabled={busy} onClick={() => { setScenes((current) => [...current, emptyScene()]); requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" })); }}>＋ 새 페이지 추가 <span>이야기의 다음 장면</span></button>}
        </section>
        <section className="story-ending" aria-label="이야기 마지막 문장" style={{ backgroundColor: endingBackground, color: backgroundInk(endingBackground) }}>
          {!readOnly && <details className="ending-options"><summary>이 페이지 꾸미기</summary><div className="ending-options-panel"><BackgroundPicker {...paletteControls} value={profile.endingBackground} fallback="#E8ECF1" onSelect={(background) => changeProfile("endingBackground", background)} /></div></details>}
          <Textarea id="endingTitle" rows={2} maxLength={80} aria-label="마지막 장면 제목" placeholder="마지막에 남길 제목" value={profile.endingTitle} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => changeProfile("endingTitle", value)} />
          <Textarea id="endingDescription" rows={2} maxLength={200} aria-label="마지막 장면 문장" placeholder="독자에게 남길 한 문장" value={profile.endingDescription} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => changeProfile("endingDescription", value)} />
        </section>
      </div>
      {!readOnly && <footer className="editor-footer"><span>글과 사진은 이 브라우저에 자동 저장됩니다. 다른 기기와 동기화되거나 공개되지는 않습니다.</span><Link href="/story">독자 화면에서 읽기 ↗</Link></footer>}
    </main>
    <dialog ref={dialogRef} id="photoDialog" className="photo-dialog" aria-labelledby="photoDialogTitle" onCancel={(event) => { event.preventDefault(); closePhoto(); }}><form onSubmit={(event) => { event.preventDefault(); void savePhoto(); }}><div className="dialog-heading"><div><span>사진 넣기 전 조절</span><h2 id="photoDialogTitle">사진을 어떻게 보여줄까요?</h2></div><button id="cancelPhoto" type="button" aria-label="닫기" onClick={closePhoto}>×</button></div><div className="photo-preview-stage">{pending && <img id="pendingPhoto" src={pending.url} alt="선택한 사진 미리보기" style={{ objectFit: pendingFit, objectPosition: `${pendingX}% ${pendingY}%` }} />}</div><div className="photo-dialog-controls"><fieldset><legend>표시 방식</legend><label><input type="radio" name="photoFitChoice" value="cover" checked={pendingFit === "cover"} onChange={() => setPendingFit("cover")} /> 채워서 자르기</label><label><input type="radio" name="photoFitChoice" value="contain" checked={pendingFit === "contain"} onChange={() => setPendingFit("contain")} /> 전체 보이기</label></fieldset><label>가로 위치<input id="pendingPhotoX" type="range" min="0" max="100" value={pendingX} onChange={(event) => setPendingX(Number(event.target.value))} /></label><label>세로 위치<input id="pendingPhotoY" type="range" min="0" max="100" value={pendingY} onChange={(event) => setPendingY(Number(event.target.value))} /></label></div><div className="dialog-actions"><button type="button" id="photoCancel" onClick={closePhoto}>취소</button><button id="photoApply" disabled={busy}>이대로 사진 넣기</button></div></form></dialog>
  </div>;
}

function SceneCard({ scene, index, count, blob, readOnly, confirmDelete, palette, onPaletteChange, onPaletteAdd, onPaletteRemove, onBackgroundChange, onChange, onPhotoChange, onPhotoDelete, onDelete, onDragStart, onDragKey }: {
  scene: Scene; index: number; count: number; blob?: Blob; readOnly: boolean; confirmDelete: boolean;
  palette: PaletteColor[]; onPaletteChange: (id: string, color: string) => void; onPaletteAdd: () => void; onPaletteRemove: (id: string) => void; onBackgroundChange: (background: string) => void;
  onChange: <K extends keyof Scene>(key: K, value: Scene[K]) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void; onPhotoDelete: () => void; onDelete: () => void;
  onDragStart: (event: PointerEvent<HTMLButtonElement>) => void; onDragKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const url = useBlobUrl(blob);
  const hasContent = Boolean(blob || [scene.year, scene.label, scene.title, scene.description].some((value) => value.trim()));
  const background = resolveBackground(scene.background, palette, "#F0F2F5");
  return <article className={`story-scene ${themes[scene.theme] || ""} ratio-${scene.mediaRatio}`} data-id={scene.id} data-index={index} data-has-content={String(hasContent)} style={{ backgroundColor: background, color: backgroundInk(background) }}>
    <div className="scene-number">{String(index + 1).padStart(2, "0")}</div>
    {!readOnly && <div className="scene-top-actions">
      <details className="scene-options"><summary>배경·사진 꾸미기</summary><div className="options-panel">
        <BackgroundPicker palette={palette} value={scene.background} fallback="#F0F2F5" onSelect={onBackgroundChange} onPaletteChange={onPaletteChange} onPaletteAdd={onPaletteAdd} onPaletteRemove={onPaletteRemove} />
        <label>사진과 글 비율<select data-field="mediaRatio" value={scene.mediaRatio} onChange={(event) => onChange("mediaRatio", event.target.value as MediaRatio)}><option value="balanced">균형 · 글 55% / 사진 45%</option><option value="text">글 중심 · 글 65% / 사진 35%</option><option value="photo">사진 중심 · 글 40% / 사진 60%</option></select></label>
        <label>사진 표시<select data-field="photoFit" value={scene.photoFit} onChange={(event) => onChange("photoFit", event.target.value as PhotoFit)}><option value="cover">채워서 자르기</option><option value="contain">전체 보이기</option></select></label>
        <label>사진 가로 위치<input data-field="photoX" type="range" min="0" max="100" value={scene.photoX} onChange={(event) => onChange("photoX", Number(event.target.value))} /></label>
        <label>사진 세로 위치<input data-field="photoY" type="range" min="0" max="100" value={scene.photoY} onChange={(event) => onChange("photoY", Number(event.target.value))} /></label>
        {url && <button className="remove-photo" type="button" onClick={onPhotoDelete}>사진 제거</button>}
      </div></details>
      <button className="drag-handle" type="button" aria-label={`${index + 1}번째 장면 순서 변경. 끌거나 방향키로 이동`} title="끌어서 순서 변경" onPointerDown={onDragStart} onKeyDown={onDragKey}><span className="drag-grip" aria-hidden="true">⋮⋮</span><span>순서 변경</span></button>
    </div>}
    <div className="scene-text"><div className="scene-meta"><input data-field="year" maxLength={16} aria-label={`${index + 1}번째 장면의 연도`} placeholder="연도 또는 시기" value={scene.year} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(event) => onChange("year", event.target.value)} /><input data-field="label" maxLength={28} aria-label={`${index + 1}번째 장면의 작은 제목`} placeholder="장면 이름" value={scene.label} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(event) => onChange("label", event.target.value)} /></div>
      <Textarea data-field="title" rows={2} maxLength={80} aria-label={`${index + 1}번째 장면의 제목`} placeholder="이 순간의 제목" value={scene.title} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => onChange("title", value)} />
      <Textarea data-field="description" rows={3} maxLength={300} aria-label={`${index + 1}번째 장면의 이야기`} placeholder="그때 어떤 일이 있었나요? 짧게 적어보세요." value={scene.description} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} onChange={(value) => onChange("description", value)} />
      {!readOnly && count > 1 && <div className="scene-tools"><button className="remove-scene" type="button" onClick={onDelete}>{confirmDelete ? "다시 누르면 삭제" : "장면 삭제"}</button></div>}
    </div>
    {(url || !readOnly) && <div className="scene-photo">{url ? <img className="scene-photo-image" src={url} alt={`${scene.title || "장면"}에 넣은 사진`} style={{ objectFit: scene.photoFit, objectPosition: `${scene.photoX}% ${scene.photoY}%` }} /> : <div className="scene-photo-empty"><span>이 장면의 사진</span><small>직접 고른 사진이 여기에 들어갑니다</small></div>}{!readOnly && <label className="photo-picker">＋ 사진 {url ? "바꾸기" : "넣기"}<input className="photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={onPhotoChange} /></label>}</div>}
  </article>;
}
