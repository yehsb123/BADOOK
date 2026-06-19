// ============================================
// 바둑 AI 엔진 (난이도: 하/중/상)
// ============================================

import {
  GameState,
  Position,
  Stone,
  getAllValidMoves,
  isValidMove,
  placeStone,
} from './game-engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

// 인접 좌표
function getNeighbors(pos: Position, size: number): Position[] {
  const dirs = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  return dirs
    .map(d => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

// 그룹의 활로 수
function countLiberties(board: Stone[][], pos: Position): number {
  const color = board[pos.row][pos.col];
  if (!color) return 0;
  const size = board.length;
  const visited = new Set<string>();
  const liberties = new Set<string>();
  const queue: Position[] = [pos];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const key = `${current.row},${current.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    for (const n of getNeighbors(current, size)) {
      const nKey = `${n.row},${n.col}`;
      if (board[n.row][n.col] === null) {
        liberties.add(nKey);
      } else if (board[n.row][n.col] === color && !visited.has(nKey)) {
        queue.push(n);
      }
    }
  }
  return liberties.size;
}

// 수의 점수 계산
function evaluateMove(state: GameState, pos: Position): number {
  const { board, boardSize, currentPlayer } = state;
  let score = 0;
  const opp = currentPlayer === 'black' ? 'white' : 'black';

  // 1. 중앙 근처에 높은 점수 (초반 전략)
  const center = boardSize / 2;
  const distFromCenter = Math.abs(pos.row - center) + Math.abs(pos.col - center);
  score += Math.max(0, boardSize - distFromCenter) * 0.5;

  // 2. 화점(星) 위치 보너스
  const starPoints = getStarPoints(boardSize);
  if (starPoints.some(sp => sp.row === pos.row && sp.col === pos.col)) {
    score += 5;
  }

  // 3. 상대 돌 따냄 가능 → 높은 점수
  const testState = placeStone(state, pos);
  if (testState) {
    const captured =
      currentPlayer === 'black'
        ? testState.capturedByBlack - state.capturedByBlack
        : testState.capturedByWhite - state.capturedByWhite;
    score += captured * 15;
  }

  // 4. 상대 그룹의 활로를 줄이는 수
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === opp) {
      const libs = countLiberties(board, n);
      if (libs <= 2) score += (3 - libs) * 8;
    }
  }

  // 5. 내 그룹 연결/보강
  for (const n of getNeighbors(pos, boardSize)) {
    if (board[n.row][n.col] === currentPlayer) {
      const libs = countLiberties(board, n);
      if (libs <= 2) score += 6; // 위험한 내 그룹 보강
      else score += 2;
    }
  }

  // 6. 변/귀 근처 (3-4선 선호)
  const thirdLine = 2;
  const fourthLine = 3;
  if (
    pos.row === thirdLine || pos.row === boardSize - 1 - thirdLine ||
    pos.col === thirdLine || pos.col === boardSize - 1 - thirdLine
  ) {
    score += 3;
  }
  if (
    pos.row === fourthLine || pos.row === boardSize - 1 - fourthLine ||
    pos.col === fourthLine || pos.col === boardSize - 1 - fourthLine
  ) {
    score += 2;
  }

  // 7. 1선(가장자리) 페널티 (초반)
  if (state.moveHistory.length < boardSize * 2) {
    if (pos.row === 0 || pos.row === boardSize - 1 || pos.col === 0 || pos.col === boardSize - 1) {
      score -= 5;
    }
  }

  return score;
}

// 화점 위치
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

// AI 수 선택
export function getAIMove(state: GameState, difficulty: Difficulty): Position | null {
  const validMoves = getAllValidMoves(state);
  if (validMoves.length === 0) return null;

  switch (difficulty) {
    case 'easy':
      return getEasyMove(state, validMoves);
    case 'medium':
      return getMediumMove(state, validMoves);
    case 'hard':
      return getHardMove(state, validMoves);
  }
}

// 하 난이도: 랜덤 + 기본 따냄
function getEasyMove(state: GameState, moves: Position[]): Position {
  // 30% 확률로 좋은 수, 70% 랜덤
  if (Math.random() < 0.3) {
    const scored = moves.map(m => ({ pos: m, score: evaluateMove(state, m) }));
    scored.sort((a, b) => b.score - a.score);
    // 상위 5개 중 랜덤
    const topN = scored.slice(0, Math.min(5, scored.length));
    return topN[Math.floor(Math.random() * topN.length)].pos;
  }

  // 가장자리 1선은 피하기
  const filtered = moves.filter(
    m =>
      m.row > 0 && m.row < state.boardSize - 1 &&
      m.col > 0 && m.col < state.boardSize - 1
  );
  const pool = filtered.length > 0 ? filtered : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 중 난이도: 평가 기반 + 약간의 랜덤성
function getMediumMove(state: GameState, moves: Position[]): Position {
  const scored = moves.map(m => ({ pos: m, score: evaluateMove(state, m) }));
  scored.sort((a, b) => b.score - a.score);

  // 상위 3개 중 가중 랜덤
  const topN = scored.slice(0, Math.min(3, scored.length));
  const totalScore = topN.reduce((s, m) => s + Math.max(m.score, 1), 0);
  let rand = Math.random() * totalScore;
  for (const m of topN) {
    rand -= Math.max(m.score, 1);
    if (rand <= 0) return m.pos;
  }
  return topN[0].pos;
}

// 상 난이도: 깊은 평가 + 미니맥스 (제한적)
function getHardMove(state: GameState, moves: Position[]): Position {
  // 1차: 평가 함수로 후보 필터링
  const scored = moves.map(m => ({ pos: m, score: evaluateMove(state, m) }));
  scored.sort((a, b) => b.score - a.score);

  // 상위 10개 후보에 대해 2수 앞 시뮬레이션
  const candidates = scored.slice(0, Math.min(10, scored.length));

  let bestMove = candidates[0].pos;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const nextState = placeStone(state, candidate.pos);
    if (!nextState) continue;

    let moveScore = candidate.score;

    // 상대 최선수 시뮬레이션
    const oppMoves = getAllValidMoves(nextState);
    if (oppMoves.length > 0) {
      const oppScored = oppMoves
        .slice(0, 8)
        .map(m => evaluateMove(nextState, m));
      const bestOppScore = Math.max(...oppScored);
      moveScore -= bestOppScore * 0.6;
    }

    // 2수 후 내 상황 평가
    if (oppMoves.length > 0) {
      const oppBest = oppMoves[0];
      const afterOpp = placeStone(nextState, oppBest);
      if (afterOpp) {
        const myFollowMoves = getAllValidMoves(afterOpp);
        if (myFollowMoves.length > 0) {
          const followScores = myFollowMoves
            .slice(0, 5)
            .map(m => evaluateMove(afterOpp, m));
          moveScore += Math.max(...followScores) * 0.3;
        }
      }
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = candidate.pos;
    }
  }

  return bestMove;
}
