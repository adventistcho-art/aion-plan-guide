-- Neon: AION 가이드 방문 로그
CREATE TABLE IF NOT EXISTS guide_visits (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_visits_created_at ON guide_visits (created_at DESC);
