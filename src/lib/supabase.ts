import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ──────────────────────────────────
// 타입 정의
// ──────────────────────────────────

export interface GameRecord {
  id?: string;
  player_name: string;
  board_size: number;
  difficulty: string;
  player_color: string;
  result: string; // 'black_win' | 'white_win' | 'draw'
  black_score: number;
  white_score: number;
  move_count: number;
  moves: string; // JSON string of move history
  created_at?: string;
}

// ──────────────────────────────────
// 대국 기록 저장
// ──────────────────────────────────

export async function saveGameRecord(record: GameRecord) {
  const { data, error } = await supabase
    .from('game_records')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Failed to save game record:', error);
    return null;
  }
  return data;
}

// ──────────────────────────────────
// 대국 기록 조회 (최근 20개)
// ──────────────────────────────────

export async function getGameRecords(limit = 20) {
  const { data, error } = await supabase
    .from('game_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch game records:', error);
    return [];
  }
  return data;
}

// ──────────────────────────────────
// 전적 통계
// ──────────────────────────────────

export async function getStats() {
  const { data, error } = await supabase
    .from('game_records')
    .select('result, difficulty');

  if (error) {
    console.error('Failed to fetch stats:', error);
    return { total: 0, wins: 0, losses: 0, draws: 0 };
  }

  const total = data.length;
  const wins = data.filter(r => r.result === 'player_win').length;
  const losses = data.filter(r => r.result === 'ai_win').length;
  const draws = data.filter(r => r.result === 'draw').length;

  return { total, wins, losses, draws };
}
