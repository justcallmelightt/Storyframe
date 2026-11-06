# Storyframe

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css&logoColor=white)

사진과 글을 시간순으로 엮어 스크롤로 읽는 개인 이야기 웹사이트를 만드는 서비스 MVP입니다.

## 실행

```bash
npm install
npm run dev
```

- `/` — 표지·장면·마지막 문장을 웹페이지 위에서 직접 편집
- `/stories` — 여러 이야기를 만들고, 제목을 바꾸고, 열거나 삭제
- `/story` — 같은 구성을 읽기 전용으로 표시
- 예전 `/studio`, `/sample`, `/storyframe/index.html` 주소는 `/`로 이동하고, `/storyframe/preview.html`은 `/story`로 이동

표지·각 장면·마지막 페이지의 배경색은 공유 팔레트나 직접 입력한 HEX 색상으로 설정할 수 있습니다. 팔레트 색은 추가·수정·삭제할 수 있으며, 각 페이지 오른쪽 위의 꾸미기 메뉴에서 찾을 수 있습니다. 표지에는 사진·글 정렬을 설정할 수 있고, 각 장면에는 사진·글 비율을 고르거나 사진을 넣기 전 자르기 방식과 위치를 확인할 수 있습니다. 장면은 최대 30개까지 추가할 수 있습니다.

`/`와 `/story`가 `components/storyframe-app.tsx`를 공유합니다. `lib/storyframe-storage.ts`가 글과 사진 저장을 담당하고, `public/storyframe/studio.css`와 Pretendard 폰트가 화면 스타일을 담당합니다.

## 개인정보 보호 및 보안

Storyframe은 로그인 없이도 쓸 수 있는 로컬 우선 개인 이야기 서비스입니다. 로그인하지 않아도 이야기 만들기와 관리는 이 브라우저에서 가능합니다.

- 이름, 제목, 소개, 장면 글과 화면 설정은 브라우저의 `localStorage`에 저장됩니다. 선택한 사진은 브라우저에서 크기를 조절해 `IndexedDB`에 저장됩니다.
- Tile과 같은 Google 로그인으로 Lightframe 계정을 연결할 수 있습니다. 로그인만으로 글이나 사진을 올리지는 않습니다.
- 각 이야기의 `계정에 백업`을 직접 선택한 경우에만 해당 이야기의 글·설정과 사진이 Tile Supabase 프로젝트의 사용자 전용 저장소로 전송됩니다. RLS 정책과 비공개 Storage 버킷으로 다른 계정의 자료 접근을 제한합니다.
- 계정에서 가져오기는 기존 로컬 이야기를 덮어쓰지 않고 새 로컬 이야기로 복사합니다. 클라우드 사본과 이 기기의 원본은 목록에서 각각 삭제할 수 있습니다.
- `/story` 독자 화면은 같은 브라우저에 저장된 내용을 읽습니다. 현재 공개 공유 링크나 기기 간 동기화는 제공하지 않습니다.
- 사진과 장면은 앱에서 개별 삭제할 수 있습니다. 전체 데이터를 지우려면 브라우저에서 Storyframe 사이트 데이터를 삭제해야 합니다.
- 브라우저 저장소는 암호화된 보관함이 아니므로 공용 기기에서 민감한 내용이나 다른 사람의 개인정보를 기록하지 않는 것을 권장합니다.

자세한 내용은 [개인정보 보호 및 보안](./SECURITY.md)을 참고하세요.

## 계정 연결 설정

계정 기능은 Tile과 같은 Supabase 프로젝트와 Google OAuth 설정을 사용합니다. 클라이언트에 공개해도 되는 프로젝트 URL과 Publishable Key만 사용하며, 비밀 키는 브라우저에 넣지 않습니다.

1. `.env.example`을 `.env.local`로 복사하고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 채웁니다.
2. Supabase SQL Editor에서 [`supabase/migrations/20261016022246_storyframe_cloud_stories.sql`](./supabase/migrations/20261016022246_storyframe_cloud_stories.sql)을 실행합니다.
3. Supabase Authentication의 URL Configuration에 배포 주소의 `/stories`와 로컬 개발 주소의 `/stories`를 Redirect URL로 추가합니다. Google Provider는 Tile에서 사용하는 Lightframe 설정을 사용합니다.
4. Vercel에도 같은 URL과 Publishable Key를 Environment Variables로 등록합니다.

환경 변수나 migration이 설정되지 않은 환경에서도 로컬 이야기 만들기와 관리는 계속 사용할 수 있습니다. 계정 백업은 설정이 완료된 뒤 활성화됩니다.
