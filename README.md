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
- `/story` — 같은 구성을 읽기 전용으로 표시
- 예전 `/studio`, `/sample`, `/storyframe/index.html` 주소는 `/`로 이동하고, `/storyframe/preview.html`은 `/story`로 이동

표지·각 장면·마지막 페이지의 배경색은 공유 팔레트나 직접 입력한 HEX 색상으로 설정할 수 있습니다. 팔레트 색은 추가·수정·삭제할 수 있으며, 각 페이지 오른쪽 위의 꾸미기 메뉴에서 찾을 수 있습니다. 표지에는 사진·글 정렬을 설정할 수 있고, 각 장면에는 사진·글 비율을 고르거나 사진을 넣기 전 자르기 방식과 위치를 확인할 수 있습니다. 장면은 최대 30개까지 추가할 수 있습니다.

글은 LocalStorage, 사진은 IndexedDB에 이 브라우저에 저장됩니다. 계정, 기기 간 동기화, 공개 공유 링크는 아직 제공하지 않습니다.

`/`와 `/story`가 `components/storyframe-app.tsx`를 공유합니다. `lib/storyframe-storage.ts`가 글과 사진 저장을 담당하고, `public/storyframe/studio.css`와 Pretendard 폰트가 화면 스타일을 담당합니다.
