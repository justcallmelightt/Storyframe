"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createStory, deleteStory, importStory, listStories, loadDocument, loadPhotos, openStory, putPhoto, renameStory, type PhotoKey, type Profile, type Scene, type StorySummary } from "@/lib/storyframe-storage";
import { getSupabaseClient } from "@/lib/supabase-client";

type CloudStorySummary = { story_id: string; title: string; owner: string; updated_at: string };
const storyTable = "storyframe_stories";
const photoBucket = "storyframe-assets";
const assetName = (key: PhotoKey) => key === "cover" ? "cover.webp" : `scene-${key}.webp`;

export function StoryLibrary() {
  const router = useRouter();
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [status, setStatus] = useState("불러오는 중");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudStories, setCloudStories] = useState<CloudStorySummary[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [cloudRefresh, setCloudRefresh] = useState(0);
  const [cloudReady, setCloudReady] = useState(false);

  const refresh = () => {
    const next = listStories();
    setStories(next);
    setTitles(Object.fromEntries(next.map((story) => [story.id, story.title])));
    setStatus("");
  };
  useEffect(() => {
    const frame = requestAnimationFrame(refresh);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      const frame = requestAnimationFrame(() => setAuthReady(true));
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => setSupabase(client));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setCloudStories([]);
    });
    let live = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setStatus("계정 상태를 확인하지 못했습니다. 다시 로그인해 주세요.");
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    return () => { live = false; cancelAnimationFrame(frame); subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!supabase || !user) return;
    let live = true;
    void supabase.from(storyTable).select("story_id,title,owner,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setCloudReady(false);
        setStatus("로그인되었습니다. 계정 백업은 Storyframe 저장소 설정 후 사용할 수 있습니다.");
      } else {
        setCloudReady(true);
        setCloudStories((data || []) as CloudStorySummary[]);
      }
    });
    return () => { live = false; };
  }, [supabase, user, cloudRefresh]);

  const makeStory = () => {
    try {
      createStory();
      router.push("/");
    } catch {
      setStatus("새 이야기를 저장할 공간이 부족합니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  };
  const editStory = (id: string) => {
    if (openStory(id)) router.push("/");
  };
  const saveTitle = (story: StorySummary) => {
    const title = titles[story.id] ?? story.title;
    if (title.trim() !== story.title) {
      renameStory(story.id, title);
      refresh();
    }
  };
  const removeStory = async (id: string) => {
    const removed = await deleteStory(id);
    if (removed) {
      setConfirmDelete(null);
      refresh();
      setStatus("이야기를 이 브라우저에서 삭제했습니다.");
    }
  };
  const signIn = async () => {
    if (!supabase) { setStatus("계정 연결 설정을 완료한 뒤 Google 로그인을 사용할 수 있습니다."); return; }
    setStatus("Google 계정으로 이동합니다.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/stories`, queryParams: { prompt: "select_account" } },
    });
    if (error) setStatus(`Google 로그인에 실패했습니다: ${error.message}`);
  };
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    setStatus(error ? `로그아웃하지 못했습니다: ${error.message}` : "로그아웃했습니다. 이 기기의 이야기는 그대로 남아 있습니다.");
  };
  const backupStory = async (story: StorySummary) => {
    if (!supabase || !user) { setStatus("먼저 Google 계정으로 로그인해 주세요."); return; }
    setSyncing(story.id);
    setStatus("이야기와 사진을 계정에 백업하고 있습니다.");
    try {
      const { profile, scenes } = loadDocument(story.id);
      const photos = await loadPhotos(scenes.length, story.id);
      const prefix = `${user.id}/${story.id}`;
      const currentAssetNames = new Set<string>();
      for (const [key, blob] of photos) {
        const name = assetName(key);
        currentAssetNames.add(name);
        const { error } = await supabase.storage.from(photoBucket).upload(`${prefix}/${name}`, blob, { upsert: true, contentType: "image/webp" });
        if (error) throw error;
      }
      const { error } = await supabase.from(storyTable).upsert({
        user_id: user.id,
        story_id: story.id,
        title: profile.title.trim().split("\n")[0] || profile.name.trim() || story.title,
        owner: profile.name.trim(),
        profile,
        scenes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,story_id" });
      if (error) throw error;
      const { data: storedFiles } = await supabase.storage.from(photoBucket).list(prefix, { limit: 100 });
      const stale = (storedFiles || []).filter((file) => !currentAssetNames.has(file.name)).map((file) => `${prefix}/${file.name}`);
      if (stale.length) await supabase.storage.from(photoBucket).remove(stale);
      setStatus(`“${story.title}” 이야기의 현재 버전을 계정에 백업했습니다.`);
      setCloudRefresh((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? `백업하지 못했습니다: ${error.message}` : "백업하지 못했습니다.");
    } finally { setSyncing(null); }
  };
  const restoreCloudStory = async (cloud: CloudStorySummary) => {
    if (!supabase || !user) return;
    setSyncing(`restore:${cloud.story_id}`);
    setStatus("계정 이야기를 이 브라우저로 가져오는 중입니다.");
    try {
      const { data, error } = await supabase.from(storyTable).select("profile,scenes").eq("user_id", user.id).eq("story_id", cloud.story_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("계정에서 이야기를 찾지 못했습니다.");
      const profile = data.profile as Profile;
      const scenes = data.scenes as Scene[];
      const prefix = `${user.id}/${cloud.story_id}`;
      const { data: files, error: listError } = await supabase.storage.from(photoBucket).list(prefix, { limit: 100 });
      if (listError) throw listError;
      const fileNames = new Set((files || []).map((file) => file.name));
      const restoredPhotos: Array<[PhotoKey, Blob]> = [];
      const expected: PhotoKey[] = ["cover", ...Array.from({ length: Math.min(scenes.length, 30) }, (_, index) => index)];
      for (const key of expected) {
        const name = assetName(key);
        if (!fileNames.has(name)) continue;
        const { data: blob, error: downloadError } = await supabase.storage.from(photoBucket).download(`${prefix}/${name}`);
        if (downloadError) throw downloadError;
        restoredPhotos.push([key, blob]);
      }
      const imported = importStory(profile, scenes);
      for (const [key, blob] of restoredPhotos) await putPhoto(key, blob, imported.id);
      refresh();
      setStatus(`“${cloud.title}”을 새 로컬 이야기로 가져왔습니다. 기존 이야기와 함께 보관됩니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? `가져오지 못했습니다: ${error.message}` : "이야기를 가져오지 못했습니다.");
    } finally { setSyncing(null); }
  };
  const deleteCloudStory = async (cloud: CloudStorySummary) => {
    if (!supabase || !user) return;
    setSyncing(`delete:${cloud.story_id}`);
    try {
      const prefix = `${user.id}/${cloud.story_id}`;
      const { data: files, error: listError } = await supabase.storage.from(photoBucket).list(prefix, { limit: 100 });
      if (listError) throw listError;
      if (files?.length) {
        const { error } = await supabase.storage.from(photoBucket).remove(files.map((file) => `${prefix}/${file.name}`));
        if (error) throw error;
      }
      const { error } = await supabase.from(storyTable).delete().eq("user_id", user.id).eq("story_id", cloud.story_id);
      if (error) throw error;
      setCloudRefresh((value) => value + 1);
      setStatus(`“${cloud.title}” 클라우드 사본을 삭제했습니다. 이 기기의 이야기는 남아 있습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? `클라우드 사본을 삭제하지 못했습니다: ${error.message}` : "클라우드 사본을 삭제하지 못했습니다.");
    } finally { setSyncing(null); }
  };
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;

  return <div className="storyframe-app story-library">
    <a className="skip-link" href="#storiesMain">이야기 목록으로 건너뛰기</a>
    <header className="app-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="Storyframe 편집기로">STORYFRAME</Link>
      <span className="header-purpose">내 이야기</span>
      <div className="header-actions"><span className="library-storage-note">이 브라우저에 저장 중</span>{authReady && user ? <><span className="library-account-name" title={user.email || "Google 계정"}>{displayName}</span><button className="library-login library-signout" type="button" onClick={() => void signOut()}>로그아웃</button></> : <button className="library-login" type="button" onClick={() => void signIn()} disabled={!authReady || !supabase}>{!authReady ? "계정 확인 중" : supabase ? "Google 로그인" : "로그인 설정 필요"}</button>}<button className="library-create" type="button" onClick={makeStory}>새 이야기 <span aria-hidden="true">＋</span></button></div>
    </div></header>
    <main id="storiesMain" className="library-main">
      <section className="library-heading" aria-labelledby="libraryTitle">
        <div><p className="library-kicker">STORYFRAME · 내 작업</p><h1 id="libraryTitle">내 이야기</h1><p>만들어 둔 이야기를 열고, 제목을 정리하고, 새 이야기를 시작할 수 있어요.</p></div>
        <div className="library-count"><strong>{stories.length}</strong><span>개의 이야기</span></div>
      </section>
      <div className="library-toolbar"><span>최근 수정한 순</span><span role="status" aria-live="polite">{status}</span></div>
      {stories.length ? <ul className="story-list" aria-label="저장된 이야기">
        {stories.map((story, index) => <li className="story-row" key={story.id}>
          <div className="story-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
          <div className="story-row-copy">
            <label className="story-title-label" htmlFor={`story-title-${story.id}`}>이야기 제목</label>
            <input id={`story-title-${story.id}`} className="story-title-input" value={titles[story.id] ?? story.title} maxLength={80} onChange={(event) => setTitles((current) => ({ ...current, [story.id]: event.target.value }))} onBlur={() => saveTitle(story)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <span className="story-row-meta">{story.owner || "이름 미설정"} <span aria-hidden="true">·</span> {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(story.updatedAt))} 수정</span>
          </div>
          <div className="story-row-actions">
            <button className="story-open" type="button" onClick={() => editStory(story.id)}>열기 <span aria-hidden="true">↗</span></button>
            {user && cloudReady && <button className="story-backup" type="button" disabled={syncing === story.id} onClick={() => void backupStory(story)}>{syncing === story.id ? "백업 중" : cloudStories.some((cloud) => cloud.story_id === story.id) ? "계정에 다시 백업" : "계정에 백업"}</button>}
            {stories.length > 1 && <button className="story-delete" type="button" onClick={() => confirmDelete === story.id ? void removeStory(story.id) : setConfirmDelete(story.id)} aria-label={`${story.title} 삭제`}>{confirmDelete === story.id ? "삭제 확인" : "삭제"}</button>}
            {confirmDelete === story.id && <button className="story-cancel-delete" type="button" onClick={() => setConfirmDelete(null)}>취소</button>}
          </div>
        </li>)}
      </ul> : <section className="library-empty"><h2>아직 만든 이야기가 없어요</h2><p>첫 이야기를 만들고 기억하고 싶은 순간을 담아보세요.</p><button className="library-create" type="button" onClick={makeStory}>첫 이야기 만들기 <span aria-hidden="true">＋</span></button></section>}
      {user && cloudReady && <section className="cloud-library" aria-labelledby="cloudLibraryTitle"><div className="cloud-library-heading"><div><p className="library-kicker">{displayName || "Google 계정"}</p><h2 id="cloudLibraryTitle">계정에 백업한 이야기</h2></div><span>{cloudStories.length}개</span></div>{cloudStories.length ? <ul className="story-list cloud-story-list">{cloudStories.map((story, index) => <li className="story-row" key={story.story_id}><div className="story-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div><div className="story-row-copy"><strong className="cloud-story-title">{story.title}</strong><span className="story-row-meta">{story.owner || "이름 미설정"} <span aria-hidden="true">·</span> {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(story.updated_at))} 백업</span></div><div className="story-row-actions"><button className="story-open" type="button" disabled={Boolean(syncing)} onClick={() => void restoreCloudStory(story)}>{syncing === `restore:${story.story_id}` ? "가져오는 중" : "새 이야기로 가져오기"}</button><button className="story-delete" type="button" disabled={Boolean(syncing)} onClick={() => void deleteCloudStory(story)}>클라우드 삭제</button></div></li>)}</ul> : <p className="cloud-empty">아직 계정에 백업한 이야기가 없습니다. 위 목록에서 <b>계정에 백업</b>을 선택하면 이 계정에 저장됩니다.</p>}</section>}
      <p className="library-privacy">{user && !cloudReady ? "로그인되었습니다. 이야기 백업은 Storyframe 계정 저장소 설정이 완료된 뒤 사용할 수 있습니다." : "현재 이야기는 이 브라우저에 저장됩니다. 계정에 백업을 선택하기 전에는 다른 기기로 전송되지 않습니다."}</p>
    </main>
  </div>;
}
