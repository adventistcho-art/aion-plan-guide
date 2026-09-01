# AION 사업계획 작성 가이드

삼육대학교 AION 시스템 **사업담당자용** 사업계획 작성 안내입니다.

## 바로 보기

- Vercel: https://aion-plan-guide.vercel.app
- GitHub Pages: https://adventistcho-art.github.io/aion-plan-guide/
- GitHub: https://github.com/adventistcho-art/aion-plan-guide
- Neon: project `aion-plan-guide` (방문 로그 `guide_visits`)

### 설명회 발표자료

- Vercel: https://aion-plan-guide.vercel.app/briefing
- GitHub Pages: https://adventistcho-art.github.io/aion-plan-guide/briefing.html
- 로컬: `AION_설명회_발표자료.html` (또는 `briefing.html`로 접속)

### 개정 v2 (부서 피드백 반영)

기존 장표·가이드는 그대로 두고, PDC 단순화·분류 후순위를 반영한 별도 버전입니다.

- 설명회 v2: https://aion-plan-guide.vercel.app/briefing-v2
- 가이드 v2: https://aion-plan-guide.vercel.app/guide-v2
- 개선 제안서: https://aion-plan-guide.vercel.app/proposal

## 스택

| 구분 | 용도 |
|------|------|
| GitHub | 소스 저장소 (`adventistcho-art/aion-plan-guide`) |
| Vercel | 정적 가이드 + `/api/visit` 서버리스 배포 |
| Neon | PostgreSQL — 가이드 방문 로그 (`guide_visits`) |

## 로컬

`index.html` 또는 `AION_사업계획_가이드.html`을 브라우저에서 엽니다.  
`guide-assets/` 폴더가 같은 위치에 있어야 이미지가 보입니다.

```bash
npm install
npx vercel dev
```

## Neon 연결

1. [Neon Console](https://console.neon.tech)에서 프로젝트 생성
2. Connection string을 복사
3. Vercel 프로젝트 → Settings → Environment Variables에 `DATABASE_URL` 등록
4. (선택) `sql/schema.sql`을 Neon SQL Editor에서 실행 — API가 없을 경우에도 테이블을 미리 만들 수 있음

`DATABASE_URL`이 없으면 가이드 HTML은 그대로 열리고, 방문 API만 503을 반환합니다.
