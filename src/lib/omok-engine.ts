// ============================================
// 오목 게임 엔진 + 강화된 AI
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

function checkWin(board: OmokStone[][], pos: Position, color: OmokStone, size: number): Position[] | null {
  for (const { dr, dc } of DIRECTIONS) {
    const line: Position[] = [pos];
    for (let i = 1; i < 5; i++) {
      const r = pos.row + dr * i, c = pos.col + dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }
    for (let i = 1; i < 5; i++) {
      const r = pos.row - dr * i, c = pos.col - dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== color) break;
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
    winLine,
  };
}

// ============================================
// 강화된 오목 AI
// ============================================

// 한 방향 라인 분석 (정확한 패턴 인식)
function analyzeLine(
  board: OmokStone[][],
  row: number, col: number,
  dr: number, dc: number,
  color: OmokStone,
  size: number
): { count: number; openEnds: number; gaps: number } {
  let count = 1;
  let openEnds = 0;

  // 정방향
  let r = row + dr, c = col + dc;
  while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === color) {
    count++;
    r += dr;
    c += dc;
  }
  if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null) openEnds++;

  // 역방향
  r = row - dr;
  c = col - dc;
  while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === color) {
    count++;
    r -= dr;
    c -= dc;
  }
  if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null) openEnds++;

  // 갭(빈칸 하나 건너뛴 돌) 체크 - 열린 3 변형 탐지
  let gaps = 0;
  for (const dir of [1, -1]) {
    let cr = row + dr * dir * (count > 1 ? count : 1);
    let cc = col + dc * dir * (count > 1 ? count : 1);
    // 빈칸 건너편에 같은 색 돌이 있는지
    if (cr >= 0 && cr < size && cc >= 0 && cc < size && board[cr][cc] === null) {
      const nr = cr + dr * dir, nc = cc + dc * dir;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) {
        gaps++;
      }
    }
  }

  return { count, openEnds, gaps };
}

// 위치별 위협도 평가 (공격/방어 통합)
function evaluatePosition(board: OmokStone[][], row: number, col: number, color: OmokStone, size: number): number {
  let score = 0;

  const testBoard = board.map(r => [...r]);
  testBoard[row][col] = color;

  for (const { dr, dc } of DIRECTIONS) {
    const { count, openEnds, gaps } = analyzeLine(testBoard, row, col, dr, dc, color, size);

    // 점수 체계 (위협도 기반)
    if (count >= 5) {
      score += 1000000;   // 즉시 승리
    } else if (count === 4) {
      if (openEnds === 2) score += 100000;    // 열린 4 (막을 수 없음)
      else if (openEnds === 1) score += 15000; // 닫힌 4 (한쪽 막힘)
    } else if (count === 3) {
      if (openEnds === 2) score += 20000;     // 열린 3 (매우 위험)
      else if (openEnds === 1) score += 2000;  // 닫힌 3
    } else if (count === 2) {
      if (openEnds === 2) score += 3000;      // 열린 2
      else if (openEnds === 1) score += 300;   // 닫힌 2
    } else if (count === 1) {
      if (openEnds === 2) score += 100;
      else if (openEnds === 1) score += 10;
    }

    // 갭이 있는 패턴 추가 점수
    if (gaps > 0 && count >= 2) {
      score += gaps * 1500;
    }
  }

  // 중앙 선호
  const center = size / 2;
  const dist = Math.abs(row - center) + Math.abs(col - center);
  score += Math.max(0, (size - dist)) * 3;

  return score;
}

// 쌍삼(double-three) 감지: 열린3이 2개 이상 동시에 생기는 수
function countOpenThrees(board: OmokStone[][], row: number, col: number, color: OmokStone, size: number): number {
  const testBoard = board.map(r => [...r]);
  testBoard[row][col] = color;
  let openThrees = 0;

  for (const { dr, dc } of DIRECTIONS) {
    const { count, openEnds } = analyzeLine(testBoard, row, col, dr, dc, color, size);
    if (count === 3 && openEnds === 2) openThrees++;
  }
  return openThrees;
}

// 쌍사(double-four) 감지
function countFours(board: OmokStone[][], row: number, col: number, color: OmokStone, size: number): number {
  const testBoard = board.map(r => [...r]);
  testBoard[row][col] = color;
  let fours = 0;

  for (const { dr, dc } of DIRECTIONS) {
    const { count, openEnds } = analyzeLine(testBoard, row, col, dr, dc, color, size);
    if (count >= 4 && openEnds >= 1) fours++;
  }
  return fours;
}

function hasNeighborStone(board: OmokStone[][], pos: Position, size: number, range: number = 2): boolean {
  for (let dr = -range; dr <= range; dr++) {
    for (let dc = -range; dc <= range; dc++) {
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

// 열린4를 만드는 수 찾기
function findOpenFourMove(board: OmokStone[][], size: number, color: OmokStone, moves: Position[]): Position | null {
  for (const m of moves) {
    const testBoard = board.map(r => [...r]);
    testBoard[m.row][m.col] = color;
    for (const { dr, dc } of DIRECTIONS) {
      const { count, openEnds } = analyzeLine(testBoard, m.row, m.col, dr, dc, color, size);
      if (count === 4 && openEnds === 2) return m;
    }
  }
  return null;
}

// 열린3 2개 동시에 만드는 수 (쌍삼 공격)
function findDoubleThreeMove(board: OmokStone[][], size: number, color: OmokStone, moves: Position[]): Position | null {
  for (const m of moves) {
    if (countOpenThrees(board, m.row, m.col, color, size) >= 2) return m;
  }
  return null;
}

// 4+3 동시 만드는 수
function findFourThreeMove(board: OmokStone[][], size: number, color: OmokStone, moves: Position[]): Position | null {
  for (const m of moves) {
    const fours = countFours(board, m.row, m.col, color, size);
    const threes = countOpenThrees(board, m.row, m.col, color, size);
    if (fours >= 1 && threes >= 1) return m;
  }
  return null;
}

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
    return { row: Math.floor(boardSize / 2), col: Math.floor(boardSize / 2) };
  }

  // 두 번째 수: 중앙 근처
  if (state.moveHistory.length === 1) {
    const last = state.moveHistory[0].position;
    const offsets = [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
      { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 },
    ];
    for (const o of offsets) {
      const r = last.row + o.dr, c = last.col + o.dc;
      if (r >= 0 && r < boardSize && c >= 0 && c < boardSize && board[r][c] === null) {
        return { row: r, col: c };
      }
    }
  }

  // 인접한 수만 후보로 (범위 2칸)
  const nearMoves = validMoves.filter(m => hasNeighborStone(board, m, boardSize, 2));
  const candidates = nearMoves.length > 0 ? nearMoves : validMoves;

  // === 공통: 즉시 승리 ===
  const winMove = findWinningMove(board, boardSize, currentPlayer, candidates);
  if (winMove) return winMove;

  // === 공통: 상대 즉시 승리 방어 ===
  const blockMove = findWinningMove(board, boardSize, opp, candidates);
  if (blockMove) return blockMove;

  if (difficulty === 'easy') {
    // 하: 기본 방어만, 60% 랜덤
    if (Math.random() < 0.6) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return getBestMove(board, boardSize, candidates, currentPlayer, opp);
  }

  if (difficulty === 'medium') {
    // 중: 열린4, 쌍삼 공격 + 방어
    const myOpenFour = findOpenFourMove(board, boardSize, currentPlayer, candidates);
    if (myOpenFour) return myOpenFour;
    const oppOpenFour = findOpenFourMove(board, boardSize, opp, candidates);
    if (oppOpenFour) return oppOpenFour;

    const myDoubleThree = findDoubleThreeMove(board, boardSize, currentPlayer, candidates);
    if (myDoubleThree) return myDoubleThree;

    if (Math.random() < 0.1) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return getBestMove(board, boardSize, candidates, currentPlayer, opp);
  }

  // === 상: 전략적 AI ===

  // 1. 내가 열린4 만들기
  const myOpenFour = findOpenFourMove(board, boardSize, currentPlayer, candidates);
  if (myOpenFour) return myOpenFour;

  // 2. 상대 열린4 막기
  const oppOpenFour = findOpenFourMove(board, boardSize, opp, candidates);
  if (oppOpenFour) return oppOpenFour;

  // 3. 4+3 공격
  const myFourThree = findFourThreeMove(board, boardSize, currentPlayer, candidates);
  if (myFourThree) return myFourThree;

  // 4. 상대 4+3 막기
  const oppFourThree = findFourThreeMove(board, boardSize, opp, candidates);
  if (oppFourThree) return oppFourThree;

  // 5. 쌍삼 공격
  const myDoubleThree = findDoubleThreeMove(board, boardSize, currentPlayer, candidates);
  if (myDoubleThree) return myDoubleThree;

  // 6. 상대 쌍삼 막기
  const oppDoubleThree = findDoubleThreeMove(board, boardSize, opp, candidates);
  if (oppDoubleThree) return oppDoubleThree;

  // 7. 종합 평가
  return getBestMove(board, boardSize, candidates, currentPlayer, opp);
}

function getBestMove(
  board: OmokStone[][],
  size: number,
  candidates: Position[],
  me: OmokStone,
  opp: OmokStone
): Position {
  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const m of candidates) {
    const myScore = evaluatePosition(board, m.row, m.col, me, size);
    const oppScore = evaluatePosition(board, m.row, m.col, opp, size);
    // 공격과 방어 균형 (방어를 약간 더 중시)
    const total = myScore * 1.1 + oppScore;

    if (total > bestScore) {
      bestScore = total;
      bestMove = m;
    }
  }

  return bestMove;
}
