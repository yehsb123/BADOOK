-- ================================================
-- 바둑 앱 Supabase 스키마
-- Supabase Dashboard → SQL Editor에서 실행하세요
-- ================================================

-- 대국 기록 테이블
CREATE TABLE game_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT DEFAULT '플레이어',
  board_size INT NOT NULL CHECK (board_size IN (9, 13, 19)),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  player_color TEXT NOT NULL CHECK (player_color IN ('black', 'white')),
  result TEXT NOT NULL CHECK (result IN ('player_win', 'ai_win', 'draw')),
  black_score NUMERIC(6,1) NOT NULL DEFAULT 0,
  white_score NUMERIC(6,1) NOT NULL DEFAULT 0,
  move_count INT NOT NULL DEFAULT 0,
  moves JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_game_records_created_at ON game_records (created_at DESC);
CREATE INDEX idx_game_records_difficulty ON game_records (difficulty);

-- RLS (Row Level Security) 활성화
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기/쓰기 가능 (anon key 사용 시)
CREATE POLICY "Anyone can read game_records"
  ON game_records FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert game_records"
  ON game_records FOR INSERT
  WITH CHECK (true);
