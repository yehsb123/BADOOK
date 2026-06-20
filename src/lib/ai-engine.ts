// ============================================
// 강화된 바둑 AI 엔진 (난이도: 하/중/상)
// ============================================

import {
  GameState,
  Position,
  Stone,
  getAllValidMoves,
  placeStone,
} from './game-engine';
import { mctsSearch, getMCTSIterations } from './mcts';

export type Difficulty = 'easy' | 'medium' | 'hard';

// ── 기본 유틸 ──

function getNeighbors(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

function getDiagonals(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col - 1 },
    { row: pos.row - 1, col: pos.col + 1 },
    { row: pos.row + 1, col: pos.col - 1 },
    { row: pos.row + 1, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

function opponent(color: Stone): Stone {
  return color === 'black' ? 'white' : 'black';
}

// ── 그룹 분석 ──

interface GroupInfo {
  stones: Position[];
  liberties: Set<string>;
  color: Stone;
}

function getGroup(board: Stone[][], pos: Position): GroupInfo | null {
  const color = board[pos.row][pos.col];
  if (!color) return null;

  const size = board.length;
  const visited = new Set<string>();
  const stones: Position[] = [];
  const liberties = new Set<string>();
  const queue: Position[] = [pos];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const key = `${current.row},${current.col}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(current);

    for (const n of getNeighbors(current, size)) {
      const nKey = `${n.row},${n.col}`;
      if (board[n.row][n.col] === null) {
        liberties.add(nKey);
      } else if (board[n.row][n.col] === color && !visited.has(nKey)) {
        queue.push(n);
      }
    }
  }

  return { stones, liberties, color };
}

// ── 영향력 맵 (Influence Map) ──

function buildInfluenceMap(board: Stone[][], size: number): { black: number[][]; white: number[][] } {
  const black = Array.from({ length: size }, () => Array(size).fill(0));
  const white = Array.from({ length: size }, () => Array(size).fill(0));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const stone = board[r][c];
      if (!stone) continue;
      const map = stone === 'black' ? black : white;

      // 돌 주변으로 영향력 전파 (거리 감쇄)
      for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const dist = Math.abs(dr) + Math.abs(dc);
          if (dist === 0) continue;
          const influence = Math.max(0, 5 - dist);
          map[nr][nc] += influence;
        }
      }
    }
  }

  return { black, white };
}

// ── 전략적 평가 함수 (상 난이도용) ──

function evaluateMoveAdvanced(state: GameState, pos: Position): number {
  const { board, boardSize, currentPlayer, moveHistory } = state;
  const opp = opponent(currentPlayer)!;
  let score = 0;
  const phase = moveHistory.length; // 게임 진행도

  // === 1. 착수 후 시뮬레이션 ===
  const testState = placeStone(state, pos);
  if (!testState) return -1000;

  const captured =
    currentPlayer === 'black'
      ? testState.capturedByBlack - state.capturedByBlack
      : testState.capturedByWhite - state.capturedByWhite;

  // 따냄 보너스 (크게)
  score += captured * 25;

  // === 2. 활로 분석 ===

  // 상대 그룹 압박 (활로 줄이기)
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === opp) {
      const group = getGroup(board, n);
      if (group) {
        const libs = group.liberties.size;
        if (libs === 1) score += 50;       // 단수 (아타리) → 매우 좋은 수
        else if (libs === 2) score += 20;   // 활로 2 → 압박
        else if (libs === 3) score += 8;
      }
    }
  }

  // 내 그룹 보강
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === currentPlayer) {
      const group = getGroup(board, n);
      if (group) {
        const libs = group.liberties.size;
        if (libs === 1) score += 40;       // 위급한 내 돌 구출
        else if (libs === 2) score += 15;   // 불안한 그룹 보강
        else score += 3;                    // 연결 보너스
      }
    }
  }

  // 놓은 후 내 그룹 활로 평가
  const myGroup = getGroup(testState.board, pos);
  if (myGroup) {
    const myLibs = myGroup.liberties.size;
    if (myLibs === 1) score -= 30;    // 자충에 가까운 수 페널티
    else if (myLibs === 2) score -= 5;
    else score += myLibs * 2;          // 활로 많을수록 좋음
  }

  // === 3. 위치 전략 ===

  const r = pos.row, c = pos.col;
  const edgeDist = Math.min(r, c, boardSize - 1 - r, boardSize - 1 - c);

  // 초반: 귀 + 변 (3-4선)
  if (phase < boardSize * 3) {
    if (edgeDist === 2 || edgeDist === 3) {
      score += 8;
      // 귀(코너) 근처 보너스
      const cornerDist = Math.min(
        Math.abs(r - 0) + Math.abs(c - 0),
        Math.abs(r - 0) + Math.abs(c - (boardSize - 1)),
        Math.abs(r - (boardSize - 1)) + Math.abs(c - 0),
        Math.abs(r - (boardSize - 1)) + Math.abs(c - (boardSize - 1))
      );
      if (cornerDist <= 6) score += 5;
    }
    // 1선 페널티 (초반)
    if (edgeDist === 0) score -= 15;
    if (edgeDist === 1) score -= 5;
  }

  // 화점 보너스
  const starPoints = getStarPoints(boardSize);
  if (starPoints.some(sp => sp.row === r && sp.col === c)) {
    score += phase < boardSize * 2 ? 12 : 3;
  }

  // === 4. 영향력 맵 기반 전략 ===
  const influence = buildInfluenceMap(board, boardSize);
  const myInf = currentPlayer === 'black' ? influence.black : influence.white;
  const oppInf = currentPlayer === 'black' ? influence.white : influence.black;

  // 상대 세력권에 침투하는 수
  if (oppInf[r][c] > myInf[r][c] + 3) {
    score += 10; // 상대 영역 침투
  }

  // 내 세력 확장
  if (myInf[r][c] > oppInf[r][c]) {
    score += 3; // 세력 강화
  }

  // === 5. 눈(eye) 관련 ===

  // 상대 눈 깨기 (빈칸이 상대로 둘러싸인 곳에 침입)
  let oppNeighbors = 0;
  let myNeighbors = 0;
  let emptyNeighbors = 0;
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === opp) oppNeighbors++;
    else if (board[n.row][n.col] === currentPlayer) myNeighbors++;
    else emptyNeighbors++;
  }

  // 대각선 분석 (눈 판정에 중요)
  let oppDiags = 0;
  for (const d of getDiagonals(pos, boardSize)) {
    if (board[d.row][d.col] === opp) oppDiags++;
  }

  // 상대 잠재적 눈 파괴
  if (oppNeighbors >= 3 && oppDiags >= 2) {
    score += 12;
  }

  // 내 눈 만들기 방해받는 곳은 피하기
  if (myNeighbors >= 3 && emptyNeighbors <= 1) {
    // 자기 눈 자리에 두지 않기
    score -= 20;
  }

  // === 6. 연결/끊기 전략 ===

  // 상대 그룹 사이 끊기
  const adjOppGroups = new Set<string>();
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === opp) {
      adjOppGroups.add(`${n.row},${n.col}`);
    }
  }
  if (adjOppGroups.size >= 2) {
    score += 15; // 상대 연결 끊기
  }

  // 내 그룹 연결
  const adjMyGroups = new Set<string>();
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === currentPlayer) {
      const g = getGroup(board, n);
      if (g) adjMyGroups.add(g.stones.map(s => `${s.row},${s.col}`).sort().join('|'));
    }
  }
  if (adjMyGroups.size >= 2) {
    score += 12; // 내 그룹 연결
  }

  return score;
}

// 간단한 평가 (중/하 난이도용)
function evaluateMoveSimple(state: GameState, pos: Position): number {
  const { board, boardSize, currentPlayer } = state;
  const opp = opponent(currentPlayer)!;
  let score = 0;

  const testState = placeStone(state, pos);
  if (!testState) return -1000;

  const captured =
    currentPlayer === 'black'
      ? testState.capturedByBlack - state.capturedByBlack
      : testState.capturedByWhite - state.capturedByWhite;
  score += captured * 20;

  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === opp) {
      const group = getGroup(board, n);
      if (group) {
        const libs = group.liberties.size;
        if (libs <= 2) score += (3 - libs) * 10;
      }
    }
    if (board[n.row][n.col] === currentPlayer) {
      const group = getGroup(board, n);
      if (group && group.liberties.size <= 2) score += 8;
      else score += 2;
    }
  }

  const edgeDist = Math.min(pos.row, pos.col, boardSize - 1 - pos.row, boardSize - 1 - pos.col);
  if (edgeDist === 2 || edgeDist === 3) score += 5;
  if (edgeDist === 0) score -= 8;

  const starPoints = getStarPoints(boardSize);
  if (starPoints.some(sp => sp.row === pos.row && sp.col === pos.col)) score += 6;

  return score;
}

// ── 화점 ──

function getStarPoints(size: number): Position[] {
  if (size === 19) {
    return [
      { row: 3, col: 3 }, { row: 3, col: 9 }, { row: 3, col: 15 },
      { row: 9, col: 3 }, { row: 9, col: 9 }, { row: 9, col: 15 },
      { row: 15, col: 3 }, { row: 15, col: 9 }, { row: 15, col: 15 },
    ];
  }
  if (size === 13) {
    return [
      { row: 3, col: 3 }, { row: 3, col: 9 },
      { row: 6, col: 6 },
      { row: 9, col: 3 }, { row: 9, col: 9 },
    ];
  }
  if (size === 9) {
    return [
      { row: 2, col: 2 }, { row: 2, col: 6 },
      { row: 4, col: 4 },
      { row: 6, col: 2 }, { row: 6, col: 6 },
    ];
  }
  return [];
}

// ── 후보 필터링 (성능 최적화) ──

function filterCandidates(state: GameState, moves: Position[], maxCandidates: number): Position[] {
  const { board, boardSize } = state;

  // 돌 근처(3칸 이내)만 후보로
  const nearMoves = moves.filter(m => {
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const nr = m.row + dr, nc = m.col + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && board[nr][nc] !== null) {
          return true;
        }
      }
    }
    return false;
  });

  // 초반에 돌이 거의 없으면 화점 + 3/4선 위주
  if (nearMoves.length === 0 || state.moveHistory.length < 4) {
    const starPoints = getStarPoints(boardSize);
    const openStars = starPoints.filter(sp => board[sp.row][sp.col] === null);
    if (openStars.length > 0) return openStars;
  }

  return nearMoves.length > maxCandidates
    ? nearMoves.slice(0, maxCandidates)
    : nearMoves.length > 0 ? nearMoves : moves.slice(0, maxCandidates);
}

// ── AI 수 선택 ──

export function getAIMove(state: GameState, difficulty: Difficulty): Position | null {
  const validMoves = getAllValidMoves(state);
  if (validMoves.length === 0) return null;

  switch (difficulty) {
    case 'easy': return getEasyMove(state, validMoves);
    case 'medium': return getMediumMove(state, validMoves);
    case 'hard': return getHardMove(state, validMoves);
  }
}

// 하: 40% 좋은 수, 60% 랜덤
function getEasyMove(state: GameState, moves: Position[]): Position {
  if (Math.random() < 0.4) {
    const candidates = filterCandidates(state, moves, 20);
    const scored = candidates.map(m => ({ pos: m, score: evaluateMoveSimple(state, m) }));
    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, Math.min(5, scored.length));
    return topN[Math.floor(Math.random() * topN.length)].pos;
  }

  const filtered = moves.filter(
    m => m.row > 0 && m.row < state.boardSize - 1 && m.col > 0 && m.col < state.boardSize - 1
  );
  const pool = filtered.length > 0 ? filtered : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 중: 고급 평가 함수 + 미니맥스 2수
function getMediumMove(state: GameState, moves: Position[]): Position {
  const candidates = filterCandidates(state, moves, 30);
  const scored = candidates.map(m => ({ pos: m, score: evaluateMoveAdvanced(state, m) }));
  scored.sort((a, b) => b.score - a.score);

  // 상위 5개 후보에 대해 2수 시뮬레이션
  const topN = scored.slice(0, Math.min(5, scored.length));
  let bestMove = topN[0].pos;
  let bestScore = -Infinity;

  for (const candidate of topN) {
    const next = placeStone(state, candidate.pos);
    if (!next) continue;
    let moveScore = candidate.score;

    // 상대 최선수 감점
    const oppCandidates = filterCandidates(next, getAllValidMoves(next), 10);
    if (oppCandidates.length > 0) {
      const oppBest = Math.max(...oppCandidates.slice(0, 5).map(m => evaluateMoveAdvanced(next, m)));
      moveScore -= oppBest * 0.5;
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = candidate.pos;
    }
  }
  return bestMove;
}

// 상: 고급 평가 + 미니맥스 3수 + MCTS 검증
function getHardMove(state: GameState, moves: Position[]): Position {
  const candidates = filterCandidates(state, moves, 40);

  // 1차: 평가 함수로 상위 후보
  const scored = candidates.map(m => ({ pos: m, score: evaluateMoveAdvanced(state, m) }));
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, Math.min(12, scored.length));

  let bestMove = topCandidates[0].pos;
  let bestScore = -Infinity;

  for (const candidate of topCandidates) {
    const nextState = placeStone(state, candidate.pos);
    if (!nextState) continue;

    let moveScore = candidate.score * 1.5;

    // 상대 최선수 시뮬레이션
    const oppMoves = filterCandidates(nextState, getAllValidMoves(nextState), 15);
    const oppScored = oppMoves.slice(0, 6).map(m => ({ pos: m, score: evaluateMoveAdvanced(nextState, m) }));
    oppScored.sort((a, b) => b.score - a.score);

    if (oppScored.length > 0) {
      moveScore -= oppScored[0].score * 0.7;

      // 3수째: 상대 최선수 후 내 반응
      const afterOpp = placeStone(nextState, oppScored[0].pos);
      if (afterOpp) {
        const myFollow = filterCandidates(afterOpp, getAllValidMoves(afterOpp), 8);
        const followScores = myFollow.slice(0, 4).map(m => evaluateMoveAdvanced(afterOpp, m));
        if (followScores.length > 0) {
          moveScore += Math.max(...followScores) * 0.4;
        }
      }
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = candidate.pos;
    }
  }

  // MCTS 검증: 평가 함수 1등 수와 MCTS 1등 수가 다르면 MCTS 우선
  try {
    const mctsMove = mctsSearch(state, getMCTSIterations('hard', state.boardSize));
    if (mctsMove) {
      const mctsScore = evaluateMoveAdvanced(state, mctsMove);
      // MCTS 수가 평가 함수에서도 나쁘지 않으면 MCTS 채택
      if (mctsScore >= bestScore * 0.6) return mctsMove;
    }
  } catch { /* MCTS 실패 시 무시 */ }

  return bestMove;
}
