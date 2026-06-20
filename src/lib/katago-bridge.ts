// ============================================
// KataGo 신경망 브릿지
// 우리 GameState → KataGo 추론 → 최선수 반환
// ============================================

import type { GameState, Position, Stone } from './game-engine';
import { getAllValidMoves } from './game-engine';

let engine: KataGoEngine | null = null;
let loading = false;
let loaded = false;

interface KataGoEngine {
  getBestMove(
    board: (string | null)[][],
    currentPlayer: 'black' | 'white',
    moveHistory: { x: number; y: number; player: string }[],
    komi: number,
    boardSize: number,
  ): Promise<{ x: number; y: number } | null>;
  dispose(): void;
}

export function isKataGoReady(): boolean {
  return loaded;
}

export function isKataGoLoading(): boolean {
  return loading;
}

export async function initKataGo(): Promise<boolean> {
  if (loaded) return true;
  if (loading) return false;

  loading = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tf: any = await import('@tensorflow/tfjs');
    await import('@tensorflow/tfjs-backend-wasm');

    // WASM 백엔드 설정
    const { setWasmPaths } = await import('@tensorflow/tfjs-backend-wasm');
    setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/');

    // 백엔드 초기화 (webgl > wasm > cpu)
    try {
      await tf.setBackend('webgl');
    } catch {
      try {
        await tf.setBackend('wasm');
      } catch {
        await tf.setBackend('cpu');
      }
    }
    await tf.ready();

    // 모델 로드
    const pako = await import('pako');
    const res = await fetch('/models/katago-small.bin.gz');
    if (!res.ok) throw new Error('Model fetch failed');

    const compressed = new Uint8Array(await res.arrayBuffer());
    let data: Uint8Array;
    // gzip 여부 체크
    if (compressed[0] === 0x1f && compressed[1] === 0x8b) {
      data = pako.inflate(compressed);
    } else {
      data = compressed;
    }

    // KataGo 모델 파싱 + TF.js 모델 생성
    const { parseKataGoModelV8 } = await import('./katago/loadModelV8');
    const { KataGoModelV8Tf } = await import('./katago/modelV8');
    const { fillInputsV7Fast } = await import('./katago/featuresV7Fast');
    const {
      BOARD_SIZE, BOARD_AREA, BLACK, WHITE, EMPTY,
      setBoardSize, computeLibertyMapInto,
      computeAreaMapV7KataGoInto,
      computeLadderFeaturesV7KataGoInto,
      computeLadderedStonesV7KataGoInto,
      playMove,
    } = await import('./katago/fastBoard');
    const { postprocessKataGoV8 } = await import('./katago/evalV8');

    const parsed = parseKataGoModelV8(data);
    const model = new KataGoModelV8Tf(parsed);

    // 워밍업 추론
    const warmupSize = 9;
    setBoardSize(warmupSize);
    const area = warmupSize * warmupSize;
    const testSpatial = (tf as any).zeros([1, warmupSize, warmupSize, 22]);
    const testGlobal = (tf as any).zeros([1, 19]);
    try {
      const out = model.forward(testSpatial, testGlobal);
      out.policy.dispose();
      out.value.dispose();
      out.scoreValue.dispose();
      if (out.ownership) out.ownership.dispose();
    } finally {
      testSpatial.dispose();
      testGlobal.dispose();
    }

    // 엔진 생성
    engine = {
      async getBestMove(board, currentPlayer, moveHistory, komi, boardSize) {
        setBoardSize(boardSize);
        const bArea = boardSize * boardSize;

        // 보드 → stones 배열
        const stones = new Uint8Array(bArea);
        for (let r = 0; r < boardSize; r++) {
          for (let c = 0; c < boardSize; c++) {
            const s = board[r][c];
            if (s === 'black') stones[r * boardSize + c] = BLACK;
            else if (s === 'white') stones[r * boardSize + c] = WHITE;
            else stones[r * boardSize + c] = EMPTY;
          }
        }

        // 이전 보드 (단순화: 현재와 동일)
        const prevStones = new Uint8Array(stones);
        const prevPrevStones = new Uint8Array(stones);

        // 활로 맵
        const libertyMap = new Uint8Array(bArea);
        computeLibertyMapInto(stones, libertyMap);

        // 사다리
        const ladderedStones = new Uint8Array(bArea);
        const ladderWorkingMoves = new Uint8Array(bArea);
        const prevLadderedStones = new Uint8Array(bArea);
        const prevPrevLadderedStones = new Uint8Array(bArea);

        try {
          computeLadderFeaturesV7KataGoInto({
            stones,
            koPoint: -1,
            currentPlayer: currentPlayer === 'black' ? BLACK : WHITE,
            outLadderedStones: ladderedStones,
            outLadderWorkingMoves: ladderWorkingMoves,
          });
          computeLadderedStonesV7KataGoInto({
            stones: prevStones,
            koPoint: -1,
            outLadderedStones: prevLadderedStones,
          });
          computeLadderedStonesV7KataGoInto({
            stones: prevPrevStones,
            koPoint: -1,
            outLadderedStones: prevPrevLadderedStones,
          });
        } catch {
          // 사다리 계산 실패 시 무시
        }

        // 최근 수
        const recentMoves: { move: number; player: 'black' | 'white' }[] = [];
        const histLen = Math.min(moveHistory.length, 5);
        for (let i = moveHistory.length - histLen; i < moveHistory.length; i++) {
          const m = moveHistory[i];
          recentMoves.push({
            move: m.y * boardSize + m.x,
            player: m.player as 'black' | 'white',
          });
        }

        // 특성 추출
        const spatialData = new Float32Array(bArea * 22);
        const globalData = new Float32Array(19);

        fillInputsV7Fast({
          stones,
          koPoint: -1,
          currentPlayer,
          recentMoves,
          komi,
          rules: 'korean',
          conservativePassAndIsRoot: true,
          libertyMap,
          ladderedStones,
          prevLadderedStones,
          prevPrevLadderedStones,
          ladderWorkingMoves,
          outSpatial: spatialData,
          outGlobal: globalData,
        });

        // 추론
        const spatial = (tf as any).tensor4d(spatialData, [1, boardSize, boardSize, 22]);
        const global_ = (tf as any).tensor2d(globalData, [1, 19]);

        try {
          const out = model.forward(spatial, global_);
          const policyData = await out.policy.data();

          out.policy.dispose();
          out.value.dispose();
          out.scoreValue.dispose();
          if (out.ownership) out.ownership.dispose();

          // 최선수 찾기 (policy에서 가장 높은 합법수)
          let bestIdx = -1;
          let bestProb = -Infinity;

          for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
              const idx = r * boardSize + c;
              if (board[r][c] !== null) continue; // 이미 돌이 있는 곳 제외
              const prob = policyData[idx];
              if (prob > bestProb) {
                bestProb = prob;
                bestIdx = idx;
              }
            }
          }

          if (bestIdx < 0) return null;
          return { x: bestIdx % boardSize, y: Math.floor(bestIdx / boardSize) };
        } finally {
          spatial.dispose();
          global_.dispose();
        }
      },

      dispose() {
        model.dispose();
      },
    };

    loaded = true;
    loading = false;
    return true;
  } catch (err) {
    console.error('KataGo init failed:', err);
    loading = false;
    return false;
  }
}

// GameState → KataGo 최선수
export async function getKataGoMove(state: GameState): Promise<Position | null> {
  if (!engine || !loaded) return null;

  const board = state.board.map(row =>
    row.map(cell => cell as string | null)
  );

  const moveHistory = state.moveHistory
    .filter(m => m.position !== null)
    .map(m => ({
      x: m.position!.col,
      y: m.position!.row,
      player: m.player as string,
    }));

  try {
    const result = await engine.getBestMove(
      board,
      state.currentPlayer as 'black' | 'white',
      moveHistory,
      state.komi,
      state.boardSize,
    );

    if (!result) return null;

    const pos = { row: result.y, col: result.x };

    // 유효성 검증
    const validMoves = getAllValidMoves(state);
    if (validMoves.some(m => m.row === pos.row && m.col === pos.col)) {
      return pos;
    }

    return null;
  } catch (err) {
    console.error('KataGo move failed:', err);
    return null;
  }
}
