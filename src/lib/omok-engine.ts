// ============================================
// 오목 게임 엔진
// ============================================

export type OmokStone = 'black' | 'white' | null;
export type Position = { row: number; col: number };

export interface OmokState {
  board: OmokStone[][];
  boardSize: number;
  currentPlayer: OmokStone;
  moveHistory: { position: Position; player: OmokStone }[];
  isGameOver: boolean;
  winner: OmokStone;
  winLine: Position[] | null;
}

const DIRECTIONS = [
  { dr: 0, dc: 1 },  // 가로
  { dr: 1, dc: 0 },  // 세로
  { dr: 1, dc: 1 },  // 대각선 ↘
  { dr: 1, dc: -1 }, // 대각선 ↙
];

export function createOmokGame(boardSize: number = 15): OmokState {
  return {
    board: Array.from({ length: boardSize }, () =>
      Array.from({ length: boardSize }, () => null as OmokStone)
    ),
    boardSize,
    currentPlayer: 'black',
    moveHistory: [],
    isGameOver: false,
    winner: null,
    winLine: null,
  };
}

// 5목 체크
function checkWin(board: OmokStone[][], pos: Position, color: OmokStone, size: number): Position[] | null {
  for (const { dr, dc } of DIRECTIONS) {
    const line: Position[] = [pos];

    // 정방향
    for (let i = 1; i < 5; i++) {
      const r = pos.row + dr * i;
      const c = pos.col + dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size) break;
      if (board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }
    // 역방향
    for (let i = 1; i < 5; i++) {
      const r = pos.row - dr * i;
      const c = pos.col - dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size) break;
      if (board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }

    if (line.length >= 5) return line;
  }
  return null;
}

export function isValidOmokMove(state: OmokState, pos: Position): boolean {
  if (state.isGameOver) return false;
  if (pos.row < 0 || pos.row >= state.boardSize || pos.col < 0 || pos.col >= state.boardSize) return false;
  return state.board[pos.row][pos.col] === null;
}

export function placeOmokStone(state: OmokState, pos: Position): OmokState | null {
  if (!isValidOmokMove(state, pos)) return null;

  const newBoard = state.board.map(r => [...r]);
  newBoard[pos.row][pos.col] = state.currentPlayer;

  const winLine = checkWin(newBoard, pos, state.currentPlayer, state.boardSize);
  const isBoardFull = newBoard.every(row => row.every(cell => cell !== null));

  return {
    board: newBoard,
    boardSize: state.boardSize,
    currentPlayer: state.currentPlayer === 'black' ? 'white' : 'black',
    moveHistory: [...state.moveHistory, { position: pos, player: state.currentPlayer }],
    isGameOver: !!winLine || isBoardFull,
    winner: winLine ? state.currentPlayer : null,
    winLine: winLine,
  };
}

// 오목 AI
export function getOmokAIMove(state: OmokState, difficulty: 'easy' | 'medium' | 'hard'): Position | null {
  const { board, boardSize, currentPlayer } = state;
  const opp = currentPlayer === 'black' ? 'white' : 'black';
  const validMoves: Position[] = [];

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] === null) validMoves.push({ row: r, col: c });
    }
  }

  if (validMoves.length === 0) return null;

  // 첫 수: 중앙
  if (state.moveHistory.length === 0) {
    const center = Math.floor(boardSize / 2);
    return { row: center, col: center };
  }

  if (difficulty === 'easy') {
    // 30% 좋은 수, 70% 주변 랜덤
    if (Math.random() < 0.3) {
      return getBestOmokMove(state, validMoves, currentPlayer, opp);
    }
    const nearMoves = validMoves.filter(m => hasNeighborStone(board, m, boardSize));
    const pool = nearMoves.length > 0 ? nearMoves : validMoves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (difficulty === 'medium') {
    // 즉시 승리 / 방어 체크 + 평가
    const winMove = findWinningMove(board, boardSize, currentPlayer, validMoves);
    if (winMove) return winMove;
    const blockMove = findWinningMove(board, boardSize, opp, validMoves);
    if (blockMove) return blockMove;

    if (Math.random() < 0.2) {
      const nearMoves = validMoves.filter(m => hasNeighborStone(board, m, boardSize));
      return nearMoves[Math.floor(Math.random() * nearMoves.length)] || validMoves[0];
    }
    return getBestOmokMove(state, validMoves, currentPlayer, opp);
  }

  // hard
  const winMove = findWinningMove(board, boardSize, currentPlayer, validMoves);
  if (winMove) return winMove;
  const blockMove = findWinningMove(board, boardSize, opp, validMoves);
  if (blockMove) return blockMove;

  return getBestOmokMove(state, validMoves, currentPlayer, opp);
}

function hasNeighborStone(board: OmokStone[][], pos: Position, size: number): boolean {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = pos.row + dr, c = pos.col + dc;
      if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== null) return true;
    }
  }
  return false;
}

function findWinningMove(board: OmokStone[][], size: number, color: OmokStone, moves: Position[]): Position | null {
  for (const m of moves) {
    const testBoard = board.map(r => [...r]);
    testBoard[m.row][m.col] = color;
    if (checkWin(testBoard, m, color, size)) return m;
  }
  return null;
}

function countLine(board: OmokStone[][], pos: Position, dr: number, dc: number, color: OmokStone, size: number): { count: number; openEnds: number } {
  let count = 1;
  let openEnds = 0;

  // 정방향
  let r = pos.row + dr, c = pos.col + dc;
  while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === color) {
    count++;
    r += dr;
    c += dc;
  }
  if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null) openEnds++;

  // 역방향
  r = pos.row - dr;
  c = pos.col - dc;
  while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === color) {
    count++;
    r -= dr;
    c -= dc;
  }
  if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null) openEnds++;

  return { count, openEnds };
}

function evaluateOmokPos(board: OmokStone[][], pos: Position, color: OmokStone, size: number): number {
  let score = 0;
  const testBoard = board.map(r => [...r]);
  testBoard[pos.row][pos.col] = color;

  for (const { dr, dc } of DIRECTIONS) {
    const { count, openEnds } = countLine(testBoard, pos, dr, dc, color, size);
    if (count >= 5) score += 100000;
    else if (count === 4 && openEnds === 2) score += 10000;
    else if (count === 4 && openEnds === 1) score += 5000;
    else if (count === 3 && openEnds === 2) score += 3000;
    else if (count === 3 && openEnds === 1) score += 500;
    else if (count === 2 && openEnds === 2) score += 200;
    else if (count === 2 && openEnds === 1) score += 50;
  }

  // 중앙 보너스
  const center = size / 2;
  const dist = Math.abs(pos.row - center) + Math.abs(pos.col - center);
  score += Math.max(0, size - dist) * 2;

  return score;
}

function getBestOmokMove(state: OmokState, moves: Position[], me: OmokStone, opp: OmokStone): Position {
  const { board, boardSize } = state;

  // 인접한 수만 고려 (성능 최적화)
  const nearMoves = moves.filter(m => hasNeighborStone(board, m, boardSize));
  const candidates = nearMoves.length > 0 ? nearMoves : moves;

  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const m of candidates) {
    const myScore = evaluateOmokPos(board, m, me, boardSize);
    const oppScore = evaluateOmokPos(board, m, opp, boardSize);
    const total = myScore + oppScore * 0.9;

    if (total > bestScore) {
      bestScore = total;
      bestMove = m;
    }
  }

  return bestMove;
}
