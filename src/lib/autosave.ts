// ============================================
// 자동 저장 / 이어하기 (localStorage)
// ============================================

const SAVE_KEY = 'baduk_autosave';

export interface SavedGame {
  gameType: 'baduk' | 'omok';
  difficulty: string;
  playerColor: string;
  boardSize: number;
  // 바둑: 수순 기반 복원
  moves: { row: number; col: number; player: string }[];
  timestamp: number;
}

export function saveGame(data: SavedGame): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* 저장 실패 무시 */ }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedGame;
    // 24시간 지난 저장은 무효
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
      clearSave();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
