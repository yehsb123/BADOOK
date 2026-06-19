// ============================================
// 표준 바둑 규칙 기반 게임 엔진
// ============================================

export type Stone = 'black' | 'white' | null;
export type Position = { row: number; col: number };

export interface GameState {
  board: Stone[][];
  boardSize: number;
  currentPlayer: Stone;
  capturedByBlack: number; // 흑이 잡은 돌
  capturedByWhite: number; // 백이 잡은 돌
  previousBoard: Stone[][] | null; // 패(Ko) 규칙용
  moveHistory: { position: Position | null; player: Stone }[];
  consecutivePasses: number;
  isGameOver: boolean;
  komi: number; // 덤 (백 보정)
}

// 새 게임 생성
export function createGame(boardSize: number = 19, komi: number = 6.5): GameState {
  const board = Array.from({ length: boardSize }, () =>
    Array.from({ length: boardSize }, () => null as Stone)
  );
  return {
    board,
    boardSize,
    currentPlayer: 'black',
    capturedByBlack: 0,
    capturedByWhite: 0,
    previousBoard: null,
    moveHistory: [],
    consecutivePasses: 0,
    isGameOver: false,
    komi,
  };
}

// 보드 복사
function cloneBoard(board: Stone[][]): Stone[][] {
  return board.map(row => [...row]);
}

// 보드 비교
function boardsEqual(a: Stone[][], b: Stone[][]): boolean {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

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

// 그룹 찾기 (연결된 같은 색 돌)
function getGroup(board: Stone[][], pos: Position): {
  stones: Position[];
  liberties: Position[];
} {
  const color = board[pos.row][pos.col];
  if (!color) return { stones: [], liberties: [] };

  const size = board.length;
  const visited = new Set<string>();
  const stones: Position[] = [];
  const liberties: Position[] = [];
  const libertiesSet = new Set<string>();
  const queue: Position[] = [pos];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const key = `${current.row},${current.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (board[current.row][current.col] === color) {
      stones.push(current);
      for (const neighbor of getNeighbors(current, size)) {
        const nKey = `${neighbor.row},${neighbor.col}`;
        const nStone = board[neighbor.row][neighbor.col];
        if (nStone === null && !libertiesSet.has(nKey)) {
          liberties.push(neighbor);
          libertiesSet.add(nKey);
        } else if (nStone === color && !visited.has(nKey)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return { stones, liberties };
}

// 상대 색
function opponent(color: Stone): Stone {
  return color === 'black' ? 'white' : 'black';
}

// 착수 가능 여부 확인
export function isValidMove(state: GameState, pos: Position): boolean {
  const { board, boardSize, currentPlayer, previousBoard } = state;

  // 범위 확인
  if (pos.row < 0 || pos.row >= boardSize || pos.col < 0 || pos.col >= boardSize) {
    return false;
  }

  // 이미 돌이 있는 곳
  if (board[pos.row][pos.col] !== null) return false;

  // 시뮬레이션: 돌을 놓고 상대 돌 따냄 후 자충수 확인
  const testBoard = cloneBoard(board);
  testBoard[pos.row][pos.col] = currentPlayer;

  // 상대 돌 따냄
  for (const neighbor of getNeighbors(pos, boardSize)) {
    if (testBoard[neighbor.row][neighbor.col] === opponent(currentPlayer)) {
      const group = getGroup(testBoard, neighbor);
      if (group.liberties.length === 0) {
        for (const stone of group.stones) {
          testBoard[stone.row][stone.col] = null;
        }
      }
    }
  }

  // 자충수 확인: 놓은 돌의 그룹 활로가 0이면 금지
  const myGroup = getGroup(testBoard, pos);
  if (myGroup.liberties.length === 0) return false;

  // 패(Ko) 규칙: 직전 보드 상태와 동일하면 금지
  if (previousBoard && boardsEqual(testBoard, previousBoard)) return false;

  return true;
}

// 착수
export function placeStone(state: GameState, pos: Position): GameState | null {
  if (state.isGameOver) return null;
  if (!isValidMove(state, pos)) return null;

  const newBoard = cloneBoard(state.board);
  const previousBoard = cloneBoard(state.board);
  newBoard[pos.row][pos.col] = state.currentPlayer;

  let captured = 0;

  // 상대 돌 따냄
  for (const neighbor of getNeighbors(pos, state.boardSize)) {
    if (newBoard[neighbor.row][neighbor.col] === opponent(state.currentPlayer)) {
      const group = getGroup(newBoard, neighbor);
      if (group.liberties.length === 0) {
        captured += group.stones.length;
        for (const stone of group.stones) {
          newBoard[stone.row][stone.col] = null;
        }
      }
    }
  }

  const newState: GameState = {
    ...state,
    board: newBoard,
    previousBoard,
    currentPlayer: opponent(state.currentPlayer) as 'black' | 'white',
    capturedByBlack:
      state.capturedByBlack + (state.currentPlayer === 'black' ? captured : 0),
    capturedByWhite:
      state.capturedByWhite + (state.currentPlayer === 'white' ? captured : 0),
    moveHistory: [...state.moveHistory, { position: pos, player: state.currentPlayer }],
    consecutivePasses: 0,
  };

  return newState;
}

// 패스
export function pass(state: GameState): GameState {
  const newConsecutive = state.consecutivePasses + 1;
  return {
    ...state,
    currentPlayer: opponent(state.currentPlayer) as 'black' | 'white',
    moveHistory: [...state.moveHistory, { position: null, player: state.currentPlayer }],
    consecutivePasses: newConsecutive,
    isGameOver: newConsecutive >= 2,
  };
}

// 영역 계산 (Territory scoring - 한국/일본 규칙)
export function calculateScore(state: GameState): {
  blackTerritory: number;
  whiteTerritory: number;
  blackScore: number;
  whiteScore: number;
  winner: string;
} {
  const { board, boardSize, komi } = state;
  const visited = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const key = `${r},${c}`;
      if (board[r][c] !== null || visited.has(key)) continue;

      // BFS로 빈 영역 탐색
      const queue: Position[] = [{ row: r, col: c }];
      const territory: Position[] = [];
      const borders = new Set<Stone>();
      const regionVisited = new Set<string>();

      while (queue.length > 0) {
        const current = queue.pop()!;
        const cKey = `${current.row},${current.col}`;
        if (regionVisited.has(cKey)) continue;
        regionVisited.add(cKey);
        visited.add(cKey);

        if (board[current.row][current.col] === null) {
          territory.push(current);
          for (const neighbor of getNeighbors(current, boardSize)) {
            const nKey = `${neighbor.row},${neighbor.col}`;
            if (!regionVisited.has(nKey)) {
              if (board[neighbor.row][neighbor.col] === null) {
                queue.push(neighbor);
              } else {
                borders.add(board[neighbor.row][neighbor.col]);
              }
            }
          }
        }
      }

      // 한 색으로만 둘러싸인 영역만 집으로 인정
      if (borders.size === 1) {
        const owner = borders.values().next().value;
        if (owner === 'black') blackTerritory += territory.length;
        else if (owner === 'white') whiteTerritory += territory.length;
      }
    }
  }

  const blackScore = blackTerritory + state.capturedByBlack;
  const whiteScore = whiteTerritory + state.capturedByWhite + komi;

  let winner: string;
  if (blackScore > whiteScore) winner = `흑 승 (${blackScore} vs ${whiteScore})`;
  else if (whiteScore > blackScore) winner = `백 승 (${whiteScore} vs ${blackScore})`;
  else winner = '무승부';

  return { blackTerritory, whiteTerritory, blackScore, whiteScore, winner };
}

// 사석 제거 후 점수 재계산
export function removeDeadStones(state: GameState, deadPositions: Position[]): GameState {
  const newBoard = cloneBoard(state.board);
  let extraBlackCaptures = 0;
  let extraWhiteCaptures = 0;

  for (const pos of deadPositions) {
    const stone = newBoard[pos.row][pos.col];
    if (stone === 'black') extraWhiteCaptures++;
    else if (stone === 'white') extraBlackCaptures++;
    newBoard[pos.row][pos.col] = null;
  }

  return {
    ...state,
    board: newBoard,
    capturedByBlack: state.capturedByBlack + extraBlackCaptures,
    capturedByWhite: state.capturedByWhite + extraWhiteCaptures,
  };
}

// 그룹 내 모든 돌 위치 (사석 클릭 시 그룹 전체 선택용)
export function getGroupAt(board: Stone[][], pos: Position): Position[] {
  const color = board[pos.row][pos.col];
  if (!color) return [];

  const size = board.length;
  const visited = new Set<string>();
  const stones: Position[] = [];
  const queue: Position[] = [pos];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const key = `${current.row},${current.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (board[current.row][current.col] === color) {
      stones.push(current);
      for (const neighbor of getNeighbors(current, size)) {
        const nKey = `${neighbor.row},${neighbor.col}`;
        if (board[neighbor.row][neighbor.col] === color && !visited.has(nKey)) {
          queue.push(neighbor);
        }
      }
    }
  }
  return stones;
}

// 모든 유효한 수 목록
export function getAllValidMoves(state: GameState): Position[] {
  const moves: Position[] = [];
  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      if (isValidMove(state, { row: r, col: c })) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}
