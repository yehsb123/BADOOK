// ============================================
// 몬테카를로 트리 탐색 (MCTS) 바둑 AI
// 안전한 구현 - 무한루프 방지
// ============================================

import {
  GameState,
  Position,
  Stone,
  placeStone,
  pass,
  isValidMove,
  calculateScore,
  getAllValidMoves,
} from './game-engine';

// ── MCTS 노드 ──

class MCTSNode {
  state: GameState;
  parent: MCTSNode | null;
  move: Position | null;
  children: MCTSNode[] = [];
  wins = 0;
  visits = 0;
  untriedMoves: Position[];
  playerJustMoved: Stone;

  constructor(state: GameState, parent: MCTSNode | null = null, move: Position | null = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.playerJustMoved = state.currentPlayer === 'black' ? 'white' : 'black';
    this.untriedMoves = getSmartMoves(state);
  }

  selectChild(): MCTSNode {
    const C = 1.4;
    let best: MCTSNode | null = null;
    let bestUCT = -Infinity;

    for (const child of this.children) {
      if (child.visits === 0) return child;
      const uct = (child.wins / child.visits) + C * Math.sqrt(Math.log(this.visits) / child.visits);
      if (uct > bestUCT) {
        bestUCT = uct;
        best = child;
      }
    }
    return best || this.children[0];
  }

  expand(): MCTSNode | null {
    // 최대 10번만 시도
    for (let attempt = 0; attempt < 10 && this.untriedMoves.length > 0; attempt++) {
      const moveIdx = Math.floor(Math.random() * this.untriedMoves.length);
      const move = this.untriedMoves.splice(moveIdx, 1)[0];
      const nextState = placeStone(this.state, move);

      if (nextState) {
        const child = new MCTSNode(nextState, this, move);
        this.children.push(child);
        return child;
      }
    }
    return null;
  }

  backpropagate(result: number) {
    let node: MCTSNode | null = this;
    while (node) {
      node.visits++;
      if (node.playerJustMoved === 'black') {
        node.wins += result;
      } else {
        node.wins += 1 - result;
      }
      node = node.parent;
    }
  }
}

// ── 후보수 필터링 ──

function getNeighbors(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

function getSmartMoves(state: GameState): Position[] {
  const { board, boardSize } = state;

  if (state.isGameOver) return [];

  const allMoves = getAllValidMoves(state);
  if (allMoves.length === 0) return [];

  // 초반: 3/4선 위주
  if (state.moveHistory.length < 6) {
    const opening = allMoves.filter(m => {
      const d = Math.min(m.row, m.col, boardSize - 1 - m.row, boardSize - 1 - m.col);
      return d >= 2 && d <= 4;
    });
    if (opening.length > 0) return opening.slice(0, 20);
  }

  // 돌 근처(2칸)만 후보
  const near = allMoves.filter(m => {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = m.row + dr, nc = m.col + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && board[nr][nc] !== null) {
          return true;
        }
      }
    }
    return false;
  });

  const result = near.length > 0 ? near : allMoves;
  return result.slice(0, 25); // 최대 25개
}

// ── 빠른 랜덤 플레이아웃 ──

function simulate(state: GameState): number {
  let current = state;
  let passes = 0;
  const maxMoves = Math.min(state.boardSize * state.boardSize, 80);

  for (let i = 0; i < maxMoves; i++) {
    if (current.isGameOver || passes >= 2) break;

    // 빈 칸 중 돌 근처에서 랜덤 선택
    const move = getRandomNearMove(current);

    if (!move) {
      current = pass(current);
      passes++;
      continue;
    }

    const next = placeStone(current, move);
    if (next) {
      current = next;
      passes = 0;
    } else {
      passes++;
      if (passes >= 2) break;
    }
  }

  const score = calculateScore(current);
  if (score.blackScore > score.whiteScore) return 1;
  if (score.whiteScore > score.blackScore) return 0;
  return 0.5;
}

// 돌 근처에서 랜덤한 유효수 하나 빠르게 찾기
function getRandomNearMove(state: GameState): Position | null {
  const { board, boardSize, currentPlayer } = state;
  const opp = currentPlayer === 'black' ? 'white' : 'black';

  // 긴급수 먼저: 단수인 상대 돌 잡기 / 내 돌 살리기
  const urgentMoves: Position[] = [];
  const normalMoves: Position[] = [];

  // 랜덤 시작점으로 편향 방지
  const startR = Math.floor(Math.random() * boardSize);
  const startC = Math.floor(Math.random() * boardSize);

  for (let di = 0; di < boardSize; di++) {
    for (let dj = 0; dj < boardSize; dj++) {
      const r = (startR + di) % boardSize;
      const c = (startC + dj) % boardSize;

      if (board[r][c] !== null) continue;

      // 근처에 돌이 있는지 체크
      let hasNeighbor = false;
      let isUrgent = false;

      for (const n of getNeighbors({ row: r, col: c }, boardSize)) {
        const ns = board[n.row][n.col];
        if (ns !== null) hasNeighbor = true;
      }

      if (!hasNeighbor) continue;

      // 눈 채우기 방지
      const neighbors = getNeighbors({ row: r, col: c }, boardSize);
      if (neighbors.every(n => board[n.row][n.col] === currentPlayer)) continue;

      if (!isValidMove(state, { row: r, col: c })) continue;

      if (isUrgent) urgentMoves.push({ row: r, col: c });
      else normalMoves.push({ row: r, col: c });

      // 충분한 후보가 모이면 중단
      if (normalMoves.length >= 10) break;
    }
    if (normalMoves.length >= 10) break;
  }

  if (urgentMoves.length > 0) return urgentMoves[Math.floor(Math.random() * urgentMoves.length)];
  if (normalMoves.length > 0) return normalMoves[Math.floor(Math.random() * normalMoves.length)];
  return null;
}

// ── MCTS 메인 (시간 제한 포함) ──

export function mctsSearch(state: GameState, iterations: number): Position | null {
  if (state.isGameOver) return null;

  const root = new MCTSNode(state);
  if (root.untriedMoves.length === 0) return null;

  const startTime = Date.now();
  const timeLimit = 3000; // 최대 3초

  for (let i = 0; i < iterations; i++) {
    // 시간 초과 체크
    if (i % 50 === 0 && Date.now() - startTime > timeLimit) break;

    let node: MCTSNode | null = root;

    // 1. 선택
    while (node && node.untriedMoves.length === 0 && node.children.length > 0) {
      node = node.selectChild();
    }

    if (!node) break;

    // 2. 확장
    if (node.untriedMoves.length > 0) {
      const expanded = node.expand();
      if (expanded) node = expanded;
    }

    // 3. 시뮬레이션
    const result = simulate(node.state);

    // 4. 역전파
    node.backpropagate(result);
  }

  if (root.children.length === 0) return null;

  // 가장 많이 방문한 자식
  let bestChild: MCTSNode | null = null;
  let bestVisits = -1;
  for (const child of root.children) {
    if (child.visits > bestVisits) {
      bestVisits = child.visits;
      bestChild = child;
    }
  }

  return bestChild?.move || null;
}

// 난이도별 시뮬레이션 횟수
export function getMCTSIterations(difficulty: string, boardSize: number): number {
  if (boardSize <= 9) {
    switch (difficulty) {
      case 'easy': return 50;
      case 'medium': return 200;
      case 'hard': return 600;
      default: return 200;
    }
  }
  if (boardSize <= 13) {
    switch (difficulty) {
      case 'easy': return 30;
      case 'medium': return 150;
      case 'hard': return 400;
      default: return 150;
    }
  }
  // 19x19
  switch (difficulty) {
    case 'easy': return 20;
    case 'medium': return 100;
    case 'hard': return 250;
    default: return 100;
  }
}
