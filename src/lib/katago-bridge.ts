// ============================================
// KataGo 신경망 브릿지
// 우리 GameState ↔ KataGo 엔진 연결
// ============================================

import type { GameState, Position, Stone } from './game-engine';
import type { Player, BoardState, Move } from './katago/shims';

// GameState → KataGo 형식 변환
function toBoardState(board: Stone[][], size: number): BoardState {
  return board.map(row => row.map(cell => {
    if (cell === 'black') return 'black' as Player;
    if (cell === 'white') return 'white' as Player;
    return null;
  }));
}

function toMoveHistory(moves: { position: Position | null; player: Stone }[]): Move[] {
  return moves
    .filter(m => m.position !== null)
    .map(m => ({
      x: m.position!.col,
      y: m.position!.row,
      player: m.player as Player,
    }));
}

// KataGo 클라이언트 (Web Worker 기반)
let katagoWorker: Worker | null = null;
let isModelLoaded = false;
let loadingPromise: Promise<void> | null = null;

export function isKataGoReady(): boolean {
  return isModelLoaded;
}

export function isKataGoLoading(): boolean {
  return loadingPromise !== null && !isModelLoaded;
}

export async function initKataGo(): Promise<void> {
  if (isModelLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
    try {
      // Web Worker 생성 (inline)
      const workerCode = `
        importScripts('/katago-worker-bundle.js');
      `;
      // 대안: 직접 import 방식은 Next.js에서 복잡하므로,
      // 메인 스레드에서 직접 실행 (간단한 접근)
      loadModelDirect().then(() => {
        isModelLoaded = true;
        resolve();
      }).catch(reject);
    } catch (e) {
      reject(e);
    }
  });

  return loadingPromise;
}

// 메인 스레드에서 직접 모델 로드 (Web Worker 대안)
async function loadModelDirect(): Promise<void> {
  const { KataGoClient } = await import('./katago/client');
  // 초기화는 client를 통해
}

// KataGo로 최선수 요청
export async function getKataGoMove(state: GameState): Promise<Position | null> {
  if (!isModelLoaded) return null;

  // TODO: KataGo 추론 실행
  // 현재는 폴백으로 기존 AI 사용
  return null;
}
