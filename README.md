# Storyframe

[개인정보 보호 및 보안](./SECURITY.md)

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

`/`와 `/story`가 `components/storyframe-app.tsx`를 공유합니다. `lib/storyframe-storage.ts`가 글과 사진 저장을 담당하고, `public/storyframe/studio.css`와 Pretendard 폰트가 화면 스타일을 담당합니다.

## 개인정보 보호 및 보안

Storyframe은 로그인 없이 사용하는 로컬 우선 이야기 서비스입니다. 사용자가 작성한 글과 화면 설정은 브라우저의 `localStorage`에, 선택한 사진은 브라우저에서 처리한 뒤 `IndexedDB`에 저장됩니다. 현재 앱에는 자동 클라우드 백업이나 공개 공유 링크가 없습니다.

- `/story`의 독자 화면은 같은 브라우저의 데이터를 읽습니다. 주소만 공유해도 이야기가 다른 사람에게 공개되지는 않습니다.
- 현재 앱에는 작성한 글·사진을 서버에 올리는 기능이나 광고·분석 스크립트가 없습니다. 입력한 글은 화면에서 HTML로 실행하지 않고 텍스트로 표시합니다.
- 사진과 장면은 앱에서 개별 삭제할 수 있습니다. 전체 데이터를 지우려면 브라우저에서 Storyframe의 사이트 데이터를 삭제해야 하며, 현재 내보내기·복원 기능은 없습니다.
- 브라우저 저장소는 암호화된 보관함이 아니므로 공용 기기에서 민감한 글이나 사진을 작성하지 않는 것을 권장합니다.

Lightframe.은 개인정보 보호와 보안을 화면 완성도와 함께 서비스의 기본 조건으로 다룹니다. 데이터 처리 방식, 현재의 한계와 보안 문제 제보 방법은 **[개인정보 보호 및 보안 자세히 보기](./SECURITY.md)**에 설명했습니다.
