'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, Position, isValidMove } from '@/lib/game-engine';

interface GoBoardProps {
  gameState: GameState;
  onPlaceStone: (pos: Position) => void;
  lastMove: Position | null;
}

export default function GoBoard({ gameState, onPlaceStone, lastMove }: GoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { board, boardSize } = gameState;

  const getCanvasSize = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      return Math.min(w, 500);
    }
    return 360;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = getCanvasSize();
    canvas.width = size * (window.devicePixelRatio || 1);
    canvas.height = size * (window.devicePixelRatio || 1);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const padding = size * 0.05;
    const cellSize = (size - padding * 2) / (boardSize - 1);
    const stoneRadius = cellSize * 0.44;

    // 배경
    ctx.fillStyle = '#DCB35C';
    ctx.fillRect(0, 0, size, size);

    // 나무결 효과
    ctx.strokeStyle = 'rgba(139, 90, 43, 0.1)';
    for (let i = 0; i < size; i += 3) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    // 격자선
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < boardSize; i++) {
      const pos = padding + i * cellSize;
      // 가로선
      ctx.beginPath();
      ctx.moveTo(padding, pos);
      ctx.lineTo(size - padding, pos);
      ctx.stroke();
      // 세로선
      ctx.beginPath();
      ctx.moveTo(pos, padding);
      ctx.lineTo(pos, size - padding);
      ctx.stroke();
    }

    // 화점 (星)
    const starPoints = getStarPoints(boardSize);
    ctx.fillStyle = '#1a1a1a';
    for (const sp of starPoints) {
      const x = padding + sp.col * cellSize;
      const y = padding + sp.row * cellSize;
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // 좌표 레이블
    ctx.fillStyle = '#5a3a1a';
    ctx.font = `${Math.max(9, cellSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'ABCDEFGHJKLMNOPQRST'; // I 제외 (바둑 관례)
    for (let i = 0; i < boardSize; i++) {
      // 상단
      ctx.fillText(letters[i], padding + i * cellSize, padding * 0.4);
      // 좌측
      ctx.fillText(`${boardSize - i}`, padding * 0.35, padding + i * cellSize);
    }

    // 돌
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const stone = board[r][c];
        if (!stone) continue;

        const x = padding + c * cellSize;
        const y = padding + r * cellSize;

        // 그림자
        ctx.beginPath();
        ctx.arc(x + 1.5, y + 1.5, stoneRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // 돌
        if (stone === 'black') {
          const grad = ctx.createRadialGradient(
            x - stoneRadius * 0.3, y - stoneRadius * 0.3, stoneRadius * 0.1,
            x, y, stoneRadius
          );
          grad.addColorStop(0, '#555');
          grad.addColorStop(1, '#111');
          ctx.fillStyle = grad;
        } else {
          const grad = ctx.createRadialGradient(
            x - stoneRadius * 0.3, y - stoneRadius * 0.3, stoneRadius * 0.1,
            x, y, stoneRadius
          );
          grad.addColorStop(0, '#fff');
          grad.addColorStop(1, '#ccc');
          ctx.fillStyle = grad;
        }
        ctx.beginPath();
        ctx.arc(x, y, stoneRadius, 0, Math.PI * 2);
        ctx.fill();

        // 마지막 수 표시
        if (lastMove && lastMove.row === r && lastMove.col === c) {
          ctx.strokeStyle = stone === 'black' ? '#ff4444' : '#ff4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, stoneRadius * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }, [board, boardSize, lastMove, getCanvasSize]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = getCanvasSize();
    const padding = size * 0.05;
    const cellSize = (size - padding * 2) / (boardSize - 1);

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);

    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
      if (isValidMove(gameState, { row, col })) {
        onPlaceStone({ row, col });
      }
    }
  };

  const handleTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = getCanvasSize();
    const padding = size * 0.05;
    const cellSize = (size - padding * 2) / (boardSize - 1);

    const touch = e.changedTouches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);

    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
      if (isValidMove(gameState, { row, col })) {
        onPlaceStone({ row, col });
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchEnd={handleTouch}
        className="cursor-pointer rounded-lg shadow-lg"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

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
