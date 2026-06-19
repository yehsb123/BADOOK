// ============================================
// 대국 기록 (localStorage 기반)
// ============================================

export interface GameRecord {
  id: string;
  date: string;
  boardSize: number;
  difficulty: string;
  playerColor: string;
  result: 'win' | 'lose' | 'draw';
  blackScore: number;
  whiteScore: number;
  moveCount: number;
}

const STORAGE_KEY = 'baduk_history';

export function getHistory(): GameRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecord(record: Omit<GameRecord, 'id' | 'date'>): void {
  const history = getHistory();
  history.unshift({
    ...record,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  });
  // 최대 50개 보관
  if (history.length > 50) history.length = 50;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStats() {
  const history = getHistory();
  return {
    total: history.length,
    wins: history.filter(r => r.result === 'win').length,
    losses: history.filter(r => r.result === 'lose').length,
    draws: history.filter(r => r.result === 'draw').length,
  };
}
