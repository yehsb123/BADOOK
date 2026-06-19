// ============================================
// 실시간 영역 추정 (Territory Estimation)
// ============================================

import { Stone, Position } from './game-engine';

function getNeighbors(pos: Position, size: number): Position[] {
  return [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ].filter(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size);
}

export function estimateTerritory(board: Stone[][], size: number): ('black' | 'white' | null)[][] {
  const result: ('black' | 'white' | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const visited = new Set<string>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      if (board[r][c] !== null || visited.has(key)) continue;

      // BFS로 빈 영역 탐색
      const queue: Position[] = [{ row: r, col: c }];
      const region: Position[] = [];
      const borders = new Set<Stone>();
      const regionVisited = new Set<string>();

      while (queue.length > 0) {
        const current = queue.pop()!;
        const cKey = `${current.row},${current.col}`;
        if (regionVisited.has(cKey)) continue;
        regionVisited.add(cKey);
        visited.add(cKey);

        if (board[current.row][current.col] === null) {
          region.push(current);
          for (const neighbor of getNeighbors(current, size)) {
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

      // 한 색으로만 둘러싸인 영역
      if (borders.size === 1) {
        const owner = borders.values().next().value as 'black' | 'white';
        for (const pos of region) {
          result[pos.row][pos.col] = owner;
        }
      }
    }
  }

  return result;
}
