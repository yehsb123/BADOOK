// ============================================
// 몬테카를로 트리 탐색 (MCTS) 바둑 AI
// - UCT (Upper Confidence Bound for Trees)
// - 랜덤 시뮬레이션 + 스마트 플레이아웃
// ============================================

import {
  GameState,
  Position,
  Stone,
  createGame,
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
  move: Position | null; // 이 노드에 도달하기 위한 수
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

  // UCT 선택
  selectChild(): MCTSNode {
    const C = 1.4; // 탐험 상수
    let best: MCTSNode | null = null;
    let bestUCT = -Infinity;

    for (const child of this.children) {
      const exploitation = child.wins / child.visits;
      const exploration = C * Math.sqrt(Math.log(this.visits) / child.visits);
      const uct = exploitation + exploration;

      if (uct > bestUCT) {
        bestUCT = uct;
        best = child;
      }
    }
    return best!;
  }

  // 확장
  expand(): MCTSNode {
    const moveIdx = Math.floor(Math.random() * this.untriedMoves.length);
    const move = this.untriedMoves.splice(moveIdx, 1)[0];
    const nextState = placeStone(this.state, move);

    if (!nextState) {
      // 유효하지 않은 수면 다음 시도
      if (this.untriedMoves.length > 0) return this.expand();
      return this;
    }

    const child = new MCTSNode(nextState, this, move);
    this.children.push(child);
    return child;
  }

  // 역전파
  backpropagate(result: number) {
    let node: MCTSNode | null = this;
    while (node) {
      node.visits++;
      // 결과를 이 노드의 관점에서 반영
      if (node.playerJustMoved === 'black') {
        node.wins += result; // result > 0이면 흑 유리
      } else {
        node.wins += 1 - result; // 백 관점
      }
      node = node.parent;
    }
  }
}

// ── 스마트 후보수 필터링 ──

function getSmartMoves(state: GameState): Position[] {
  const { board, boardSize } = state;
  const allMoves = getAllValidMoves(state);

  if (allMoves.length === 0) return [];

  // 초반: 화점 + 3/4선 위주
  if (state.moveHistory.length < 6) {
    const starMoves = allMoves.filter(m => {
      const edgeDist = Math.min(m.row, m.col, boardSize - 1 - m.row, boardSize - 1 - m.col);
      return edgeDist >= 2 && edgeDist <= 4;
    });
    if (starMoves.length > 0) return starMoves;
  }

  // 돌 근처(3칸 이내)만 후보로 (성능 최적화)
  const nearMoves = allMoves.filter(m => {
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

  // 후보가 너무 많으면 제한 (성능)
  const candidates = nearMoves.length > 0 ? nearMoves : allMoves;
  if (candidates.length > 30) {
    return prioritizeMoves(state, candidates).slice(0, 30);
  }

  return candidates;
}

// 간단한 우선순위 정렬
function prioritizeMoves(state: GameState, moves: Position[]): Position[] {
  const { board, boardSize, currentPlayer } = state;
  const opp = currentPlayer === 'black' ? 'white' : 'black';

  const scored = moves.map(m => {
    let score = 0;

    // 상대 돌 인접 → 높은 점수
    for (const n of getNeighbors(m, boardSize)) {
      if (board[n.row][n.col] === opp) score += 3;
      else if (board[n.row][n.col] === currentPlayer) score += 2;
    }

    // 3/4선 보너스
    const edgeDist = Math.min(m.row, m.col, boardSize - 1 - m.row, boardSize - 1 - m.col);
    if (edgeDist === 2 || edgeDist === 3) score += 2;
    if (edgeDist === 0) score -= 3;

    return { move: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.move);
}

function getNeighbors(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

// ── 스마트 랜덤 플레이아웃 ──

function simulate(state: GameState): number {
  let current = state;
  let moveCount = 0;
  const maxMoves = Math.min(current.boardSize * current.boardSize, 120);

  while (!current.isGameOver && moveCount < maxMoves) {
    const moves = getPlayoutMoves(current);

    if (moves.length === 0) {
      current = pass(current);
      if (current.isGameOver) break;
      moveCount++;
      continue;
    }

    // 가중 랜덤 선택 (좋은 수에 더 높은 확률)
    const move = moves[Math.floor(Math.random() * moves.length)];
    const next = placeStone(current, move);

    if (next) {
      current = next;
    } else {
      current = pass(current);
    }

    moveCount++;

    // 조기 종료: 연속 패스
    if (current.consecutivePasses >= 2) break;
  }

  // 결과 평가
  const score = calculateScore(current);
  // 흑이 이기면 1, 지면 0, 비기면 0.5
  if (score.blackScore > score.whiteScore) return 1;
  if (score.whiteScore > score.blackScore) return 0;
  return 0.5;
}

// 플레이아웃용 수 선택 (완전 랜덤보다 스마트)
function getPlayoutMoves(state: GameState): Position[] {
  const { board, boardSize, currentPlayer } = state;
  const opp = currentPlayer === 'black' ? 'white' : 'black';
  const candidates: Position[] = [];
  const urgent: Position[] = [];

  // 빈 칸 중 돌 근처만
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] !== null) continue;
      if (!isValidMove(state, { row: r, col: c })) continue;

      let hasNeighbor = false;
      let isUrgent = false;

      for (const n of getNeighbors({ row: r, col: c }, boardSize)) {
        if (board[n.row][n.col] !== null) {
          hasNeighbor = true;
          // 상대가 단수(활로 1)인 그룹 → 잡기
          if (board[n.row][n.col] === opp) {
            const libs = countLiberties(board, n, boardSize);
            if (libs === 1) isUrgent = true;
          }
          // 내가 단수인 그룹 → 살리기
          if (board[n.row][n.col] === currentPlayer) {
            const libs = countLiberties(board, n, boardSize);
            if (libs === 1) isUrgent = true;
          }
        }
      }

      if (isUrgent) urgent.push({ row: r, col: c });
      else if (hasNeighbor) candidates.push({ row: r, col: c });
    }
  }

  // 급한 수 우선
  if (urgent.length > 0) return urgent;

  // 1선(가장자리) 자충수 방지 - 눈을 채우는 수 필터링
  const filtered = candidates.filter(m => !isEyeFillingMove(board, m, currentPlayer, boardSize));
  return filtered.length > 0 ? filtered : candidates;
}

// 자기 눈을 채우는 수인지 체크
function isEyeFillingMove(board: Stone[][], pos: Position, color: Stone, size: number): boolean {
  const neighbors = getNeighbors(pos, size);
  // 사방이 모두 같은 색이면 눈
  if (neighbors.every(n => board[n.row][n.col] === color)) {
    return true;
  }
  return false;
}

// 간단한 활로 카운트 (플레이아웃용)
function countLiberties(board: Stone[][], pos: Position, size: number): number {
  const color = board[pos.row][pos.col];
  if (!color) return 0;

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
      if (board[n.row][n.col] === null) liberties.add(nKey);
      else if (board[n.row][n.col] === color && !visited.has(nKey)) queue.push(n);
    }
  }
  return liberties.size;
}

// ── MCTS 메인 ──

export function mctsSearch(state: GameState, iterations: number): Position | null {
  const root = new MCTSNode(state);

  for (let i = 0; i < iterations; i++) {
    let node = root;

    // 1. 선택 (Selection)
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = node.selectChild();
    }

    // 2. 확장 (Expansion)
    if (node.untriedMoves.length > 0) {
      node = node.expand();
    }

    // 3. 시뮬레이션 (Simulation)
    const result = simulate(node.state);

    // 4. 역전파 (Backpropagation)
    node.backpropagate(result);
  }

  // 가장 많이 방문한 자식 선택
  if (root.children.length === 0) return null;

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

// 난이도별 시뮬레이션 횟수 (모바일 최적화)
export function getMCTSIterations(difficulty: string, boardSize: number): number {
  if (boardSize <= 9) {
    switch (difficulty) {
      case 'easy': return 80;
      case 'medium': return 300;
      case 'hard': return 800;
      default: return 300;
    }
  }
  if (boardSize <= 13) {
    switch (difficulty) {
      case 'easy': return 50;
      case 'medium': return 200;
      case 'hard': return 500;
      default: return 200;
    }
  }
  // 19x19
  switch (difficulty) {
    case 'easy': return 30;
    case 'medium': return 150;
    case 'hard': return 350;
    default: return 150;
  }
}
