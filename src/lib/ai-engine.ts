// ============================================
// 바둑 AI - 전투력 특화
// ============================================

import {
  GameState,
  Position,
  Stone,
  getAllValidMoves,
  placeStone,
} from './game-engine';
import { isKataGoReady, getKataGoMove } from './katago-bridge';

export type Difficulty = 'easy' | 'medium' | 'hard';

// ── 유틸 ──

function neighbors(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

function diagonals(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col - 1 },
    { row: pos.row - 1, col: pos.col + 1 },
    { row: pos.row + 1, col: pos.col - 1 },
    { row: pos.row + 1, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

function opp(color: Stone): Stone {
  return color === 'black' ? 'white' : 'black';
}

// ── 그룹 분석 ──

interface Group {
  stones: Set<string>;
  liberties: Set<string>;
  color: Stone;
  size: number;
}

function getGroup(board: Stone[][], r: number, c: number, size: number): Group | null {
  const color = board[r][c];
  if (!color) return null;

  const stones = new Set<string>();
  const liberties = new Set<string>();
  const queue: [number, number][] = [[r, c]];

  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    const key = `${cr},${cc}`;
    if (stones.has(key)) continue;
    stones.add(key);

    for (const n of neighbors({ row: cr, col: cc }, size)) {
      const nk = `${n.row},${n.col}`;
      const ns = board[n.row][n.col];
      if (ns === null) liberties.add(nk);
      else if (ns === color && !stones.has(nk)) queue.push([n.row, n.col]);
    }
  }

  return { stones, liberties, color, size: stones.size };
}

// 보드 위 모든 그룹 캐시
function getAllGroups(board: Stone[][], size: number): Map<string, Group> {
  const visited = new Set<string>();
  const groupMap = new Map<string, Group>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      if (visited.has(key) || board[r][c] === null) continue;
      const group = getGroup(board, r, c, size)!;
      for (const sk of group.stones) {
        visited.add(sk);
        groupMap.set(sk, group);
      }
    }
  }
  return groupMap;
}

// ── 핵심 평가 함수 ──

function evaluate(state: GameState, pos: Position): number {
  const { board, boardSize, currentPlayer, moveHistory } = state;
  const me = currentPlayer!;
  const enemy = opp(me)!;
  let score = 0;

  // 착수 시뮬레이션
  const after = placeStone(state, pos);
  if (!after) return -99999;

  const capturedCount = me === 'black'
    ? after.capturedByBlack - state.capturedByBlack
    : after.capturedByWhite - state.capturedByWhite;

  const groupsBefore = getAllGroups(board, boardSize);
  const groupsAfter = getAllGroups(after.board, boardSize);

  // ============================
  // 1. 따냄 (최우선)
  // ============================
  score += capturedCount * 30;

  // ============================
  // 2. 단수(아타리) 공격
  //    상대 그룹을 활로 1로 만드는 수
  // ============================
  for (const n of neighbors(pos, boardSize)) {
    if (board[n.row][n.col] === enemy) {
      const gBefore = groupsBefore.get(`${n.row},${n.col}`);
      const gAfter = groupsAfter.get(`${n.row},${n.col}`);
      if (gBefore && gAfter) {
        if (gAfter.liberties.size === 1 && gBefore.liberties.size > 1) {
          score += 25 + gAfter.size * 5; // 큰 그룹 단수일수록 좋음
        }
        if (gAfter.liberties.size === 2 && gBefore.liberties.size > 2) {
          score += 10 + gAfter.size * 2;
        }
      }
      // 이미 단수인 상대 그룹 근처에 두기
      if (gBefore && gBefore.liberties.size === 1) {
        score += 35 + gBefore.size * 8; // 잡을 수 있는 돌
      }
    }
  }

  // ============================
  // 3. 내 그룹 보호
  //    활로 늘리기 / 연결
  // ============================
  for (const n of neighbors(pos, boardSize)) {
    if (board[n.row][n.col] === me) {
      const gBefore = groupsBefore.get(`${n.row},${n.col}`);
      if (gBefore) {
        if (gBefore.liberties.size === 1) {
          score += 40 + gBefore.size * 10; // 위급한 내 돌 구출 (최우선)
        } else if (gBefore.liberties.size === 2) {
          score += 15 + gBefore.size * 3;
        }
      }
    }
  }

  // 놓은 후 내 그룹 활로 체크
  const myGroupAfter = groupsAfter.get(`${pos.row},${pos.col}`);
  if (myGroupAfter) {
    if (myGroupAfter.liberties.size === 1 && capturedCount === 0) {
      score -= 35; // 자충에 가까운 수 (단수에 놓기)
    } else if (myGroupAfter.liberties.size === 2) {
      score -= 5;
    }
    score += myGroupAfter.liberties.size * 2; // 활로 많을수록 좋음
  }

  // ============================
  // 4. 그룹 연결 / 끊기
  // ============================
  // 내 그룹 여러개 연결
  const myAdjacentGroups = new Set<Group>();
  for (const n of neighbors(pos, boardSize)) {
    if (board[n.row][n.col] === me) {
      const g = groupsBefore.get(`${n.row},${n.col}`);
      if (g) myAdjacentGroups.add(g);
    }
  }
  if (myAdjacentGroups.size >= 2) {
    score += 15; // 연결 보너스
    // 약한 그룹 연결은 특히 좋음
    for (const g of myAdjacentGroups) {
      if (g.liberties.size <= 3) score += 8;
    }
  }

  // 상대 그룹 끊기
  const enemyAdjacentGroups = new Set<Group>();
  for (const n of neighbors(pos, boardSize)) {
    if (board[n.row][n.col] === enemy) {
      const g = groupsBefore.get(`${n.row},${n.col}`);
      if (g) enemyAdjacentGroups.add(g);
    }
  }
  if (enemyAdjacentGroups.size >= 2) {
    score += 12; // 상대 끊기
  }

  // ============================
  // 5. 눈(eye) 관련
  // ============================
  // 자기 눈 자리에 두지 않기
  const adj = neighbors(pos, boardSize);
  const adjMe = adj.filter(n => board[n.row][n.col] === me).length;
  const adjEmpty = adj.filter(n => board[n.row][n.col] === null).length;
  const diags = diagonals(pos, boardSize);
  const diagMe = diags.filter(d => board[d.row][d.col] === me).length;

  if (adjMe === adj.length && diagMe >= diags.length - 1) {
    score -= 50; // 자기 눈 채우기 금지
  }

  // 상대 눈 파괴
  const adjEnemy = adj.filter(n => board[n.row][n.col] === enemy).length;
  const diagEnemy = diags.filter(d => board[d.row][d.col] === enemy).length;
  if (adjEnemy >= 3 && diagEnemy >= 2) {
    score += 15; // 상대 잠재적 눈 파괴
  }

  // ============================
  // 6. 포석 / 위치 전략
  // ============================
  const phase = moveHistory.length;
  const edgeDist = Math.min(pos.row, pos.col, boardSize - 1 - pos.row, boardSize - 1 - pos.col);

  if (phase < boardSize * 3) {
    // 초반: 귀 → 변 → 중앙 순서
    if (edgeDist === 2 || edgeDist === 3) {
      score += 8;
      // 귀 근처 추가 보너스
      const cornerDist = Math.min(
        pos.row + pos.col,
        pos.row + (boardSize - 1 - pos.col),
        (boardSize - 1 - pos.row) + pos.col,
        (boardSize - 1 - pos.row) + (boardSize - 1 - pos.col)
      );
      if (cornerDist <= 6) score += 6;
    }

    // 화점 보너스
    const stars = getStarPoints(boardSize);
    if (stars.some(s => s.row === pos.row && s.col === pos.col)) {
      score += phase < boardSize ? 15 : 5;
    }

    // 1선/2선 페널티 (초반)
    if (edgeDist === 0) score -= 20;
    if (edgeDist === 1) score -= 8;
  } else {
    // 중후반
    if (edgeDist === 0) score -= 5;
  }

  // ============================
  // 7. 세력 / 영향력
  // ============================
  let myInfluence = 0;
  let enemyInfluence = 0;
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
      const nr = pos.row + dr, nc = pos.col + dc;
      if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize) continue;
      const dist = Math.abs(dr) + Math.abs(dc);
      if (dist === 0) continue;
      const s = board[nr][nc];
      if (s === me) myInfluence += 4 - dist;
      else if (s === enemy) enemyInfluence += 4 - dist;
    }
  }

  // 상대 세력권 침투
  if (enemyInfluence > myInfluence + 4) score += 8;
  // 내 세력 확장
  if (myInfluence > enemyInfluence && adjEmpty > 2) score += 4;
  // 고립된 수 피하기
  if (myInfluence === 0 && enemyInfluence === 0 && phase > 6) score -= 5;

  return score;
}

// ── 화점 ──

function getStarPoints(size: number): Position[] {
  if (size === 19) return [
    {row:3,col:3},{row:3,col:9},{row:3,col:15},
    {row:9,col:3},{row:9,col:9},{row:9,col:15},
    {row:15,col:3},{row:15,col:9},{row:15,col:15},
  ];
  if (size === 13) return [
    {row:3,col:3},{row:3,col:9},{row:6,col:6},{row:9,col:3},{row:9,col:9},
  ];
  if (size === 9) return [
    {row:2,col:2},{row:2,col:6},{row:4,col:4},{row:6,col:2},{row:6,col:6},
  ];
  return [];
}

// ── 후보수 필터링 ──

function getCandidates(state: GameState, maxCount: number): Position[] {
  const { board, boardSize } = state;
  const all = getAllValidMoves(state);
  if (all.length === 0) return [];

  // 초반: 화점 우선 (랜덤 섞기)
  if (state.moveHistory.length < 6) {
    const stars = getStarPoints(boardSize).filter(s => board[s.row][s.col] === null);
    const opening = all.filter(m => {
      const d = Math.min(m.row, m.col, boardSize - 1 - m.row, boardSize - 1 - m.col);
      return d >= 2 && d <= 4;
    });
    // 랜덤 섞기
    const shuffled = [...(stars.length > 0 ? stars : opening)];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.length > 0) return shuffled.slice(0, maxCount);
  }

  // 돌 근처(3칸)만
  const near = all.filter(m => {
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const nr = m.row + dr, nc = m.col + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && board[nr][nc] !== null) return true;
      }
    }
    return false;
  });

  return (near.length > 0 ? near : all).slice(0, maxCount);
}

// ── AI 메인 ──

export function getAIMove(state: GameState, difficulty: Difficulty): Position | null {
  const all = getAllValidMoves(state);
  if (all.length === 0) return null;

  switch (difficulty) {
    case 'easy': return easyMove(state, all);
    case 'medium': return mediumMove(state);
    case 'hard': return hardMove(state);
  }
}

// KataGo 신경망 사용 (async) - 모든 난이도에서 사용
export async function getAIMoveAsync(state: GameState, difficulty: Difficulty): Promise<Position | null> {
  if (isKataGoReady()) {
    try {
      const kataMove = await getKataGoMove(state);
      if (kataMove) {
        // 하 난이도: 50% 확률로 KataGo, 50% 랜덤
        if (difficulty === 'easy' && Math.random() < 0.5) {
          return getAIMove(state, 'easy');
        }
        // 중 난이도: 20% 확률로 기존 AI (약간의 실수)
        if (difficulty === 'medium' && Math.random() < 0.2) {
          return getAIMove(state, 'medium');
        }
        return kataMove;
      }
    } catch {
      // KataGo 실패 시 폴백
    }
  }

  // 폴백: 기존 평가함수 AI
  return getAIMove(state, difficulty);
}

// 하: 40% 전략, 60% 랜덤
function easyMove(state: GameState, all: Position[]): Position {
  if (Math.random() < 0.4) {
    const candidates = getCandidates(state, 15);
    const scored = candidates.map(m => ({ m, s: evaluate(state, m) }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.min(5, scored.length));
    return top[Math.floor(Math.random() * top.length)].m;
  }
  const filtered = all.filter(m =>
    m.row > 0 && m.row < state.boardSize - 1 && m.col > 0 && m.col < state.boardSize - 1
  );
  return (filtered.length > 0 ? filtered : all)[Math.floor(Math.random() * (filtered.length || all.length))];
}

// 중: 평가 + 2수 탐색
function mediumMove(state: GameState): Position {
  const candidates = getCandidates(state, 25);
  const scored = candidates.map(m => ({ m, s: evaluate(state, m) }));
  scored.sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.min(8, scored.length));
  let best = top[0].m;
  let bestS = -Infinity;

  for (const { m, s } of top) {
    const next = placeStone(state, m);
    if (!next) continue;
    let total = s;

    // 상대 반격 감점
    const oppCands = getCandidates(next, 8);
    if (oppCands.length > 0) {
      const oppBest = Math.max(...oppCands.slice(0, 5).map(om => evaluate(next, om)));
      total -= oppBest * 0.5;
    }

    if (total > bestS) { bestS = total; best = m; }
  }
  return best;
}

// 상: 평가 + 3수 탐색
function hardMove(state: GameState): Position {
  const candidates = getCandidates(state, 35);
  const scored = candidates.map(m => ({ m, s: evaluate(state, m) }));
  scored.sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.min(12, scored.length));
  let best = top[0].m;
  let bestS = -Infinity;

  for (const { m, s } of top) {
    const next = placeStone(state, m);
    if (!next) continue;
    let total = s * 1.5;

    // 상대 최선수
    const oppCands = getCandidates(next, 12);
    const oppScored = oppCands.slice(0, 6).map(om => ({ m: om, s: evaluate(next, om) }));
    oppScored.sort((a, b) => b.s - a.s);

    if (oppScored.length > 0) {
      total -= oppScored[0].s * 0.7;

      // 3수째: 내 반응
      const afterOpp = placeStone(next, oppScored[0].m);
      if (afterOpp) {
        const myCands = getCandidates(afterOpp, 8);
        const myScores = myCands.slice(0, 4).map(fm => evaluate(afterOpp, fm));
        if (myScores.length > 0) {
          total += Math.max(...myScores) * 0.4;
        }
      }
    }

    if (total > bestS) { bestS = total; best = m; }
  }
  return best;
}
