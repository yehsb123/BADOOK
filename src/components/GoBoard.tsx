'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, Position, Stone, isValidMove } from '@/lib/game-engine';

export type BoardMode = 'play' | 'dead-stone' | 'replay';

interface GoBoardProps {
  gameState: GameState;
  onPlaceStone: (pos: Position) => void;
  onConfirmMove?: () => void;
  onCancelMove?: () => void;
  onToggleDeadStone?: (pos: Position) => void;
  lastMove: Position | null;
  previewPos?: Position | null;
  deadStones?: Set<string>;
  mode?: BoardMode;
  confirmMode?: boolean;
  replayMoveIndex?: number; // 리플레이 시 현재 수순
  displayBoard?: Stone[][]; // 리플레이용 보드
  winLine?: Position[] | null; // 오목 승리 라인
}

export default function GoBoard({
  gameState,
  onPlaceStone,
  onConfirmMove,
  onCancelMove,
  onToggleDeadStone,
  lastMove,
  previewPos = null,
  deadStones,
  mode = 'play',
  confirmMode = false,
  replayMoveIndex,
  displayBoard,
  winLine,
}: GoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const board = displayBoard || gameState.board;
  const { boardSize } = gameState;
  const [hoverPos, setHoverPos] = useState<Position | null>(null);

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
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const padding = size * 0.05;
    const cellSize = (size - padding * 2) / (boardSize - 1);
    const stoneRadius = cellSize * 0.44;

    // 배경
    ctx.fillStyle = '#DCB35C';
    ctx.fillRect(0, 0, size, size);

    // 나무결
    ctx.strokeStyle = 'rgba(139, 90, 43, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < size; i += 3) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i + (Math.sin(i * 0.1) * 2));
      ctx.stroke();
    }

    // 격자선
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < boardSize; i++) {
      const pos = padding + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(padding, pos);
      ctx.lineTo(size - padding, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, padding);
      ctx.lineTo(pos, size - padding);
      ctx.stroke();
    }

    // 화점
    const starPoints = getStarPoints(boardSize);
    ctx.fillStyle = '#1a1a1a';
    for (const sp of starPoints) {
      const x = padding + sp.col * cellSize;
      const y = padding + sp.row * cellSize;
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // 좌표
    ctx.fillStyle = '#5a3a1a';
    ctx.font = `${Math.max(9, cellSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'ABCDEFGHJKLMNOPQRST';
    for (let i = 0; i < boardSize; i++) {
      ctx.fillText(letters[i], padding + i * cellSize, padding * 0.4);
      ctx.fillText(`${boardSize - i}`, padding * 0.35, padding + i * cellSize);
    }

    // 돌 그리기
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const stone = board[r][c];
        if (!stone) continue;

        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        const isDead = deadStones?.has(`${r},${c}`);

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

        // 사석 표시 (X 마크)
        if (isDead) {
          ctx.strokeStyle = stone === 'black' ? '#ff6666' : '#ff4444';
          ctx.lineWidth = 2.5;
          const m = stoneRadius * 0.45;
          ctx.beginPath();
          ctx.moveTo(x - m, y - m);
          ctx.lineTo(x + m, y + m);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + m, y - m);
          ctx.lineTo(x - m, y + m);
          ctx.stroke();
          // 반투명 오버레이
          ctx.beginPath();
          ctx.arc(x, y, stoneRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,0,0,0.15)';
          ctx.fill();
        }

        // 오목 승리 라인 표시
        const isWinStone = winLine?.some(w => w.row === r && w.col === c);
        if (isWinStone) {
          // 황금 빛 테두리
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, stoneRadius + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 마지막 수 표시
        if (lastMove && lastMove.row === r && lastMove.col === c && !isDead && !isWinStone) {
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, stoneRadius * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 리플레이 수순 번호
        if (mode === 'replay' && replayMoveIndex !== undefined) {
          // 마지막 놓인 돌에만 번호 표시
          if (lastMove && lastMove.row === r && lastMove.col === c) {
            ctx.fillStyle = stone === 'black' ? '#fff' : '#000';
            ctx.font = `bold ${Math.max(10, cellSize * 0.38)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${replayMoveIndex}`, x, y);
          }
        }
      }
    }

    // 미리보기 돌 (반투명)
    if (previewPos && mode === 'play') {
      const x = padding + previewPos.col * cellSize;
      const y = padding + previewPos.row * cellSize;

      ctx.globalAlpha = 0.5;
      if (gameState.currentPlayer === 'black') {
        ctx.fillStyle = '#333';
      } else {
        ctx.fillStyle = '#ddd';
      }
      ctx.beginPath();
      ctx.arc(x, y, stoneRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // 확인 테두리
      if (confirmMode) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(x, y, stoneRadius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 호버 표시 (PC)
    if (hoverPos && !previewPos && mode === 'play' && !board[hoverPos.row]?.[hoverPos.col]) {
      const x = padding + hoverPos.col * cellSize;
      const y = padding + hoverPos.row * cellSize;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = gameState.currentPlayer === 'black' ? '#333' : '#ddd';
      ctx.beginPath();
      ctx.arc(x, y, stoneRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
  }, [board, boardSize, lastMove, previewPos, deadStones, mode, confirmMode, hoverPos, getCanvasSize, gameState.currentPlayer, replayMoveIndex, winLine]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const getPosFromEvent = (clientX: number, clientY: number): Position | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const size = getCanvasSize();
    const padding = size * 0.05;
    const cellSize = (size - padding * 2) / (boardSize - 1);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);
    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
      return { row, col };
    }
    return null;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPosFromEvent(e.clientX, e.clientY);
    if (!pos) return;

    if (mode === 'dead-stone') {
      onToggleDeadStone?.(pos);
      return;
    }

    if (mode === 'play') {
      if (isValidMove(gameState, pos)) {
        onPlaceStone(pos);
      }
    }
  };

  const handleTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const pos = getPosFromEvent(touch.clientX, touch.clientY);
    if (!pos) return;

    if (mode === 'dead-stone') {
      onToggleDeadStone?.(pos);
      return;
    }

    if (mode === 'play') {
      if (isValidMove(gameState, pos)) {
        onPlaceStone(pos);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'play') { setHoverPos(null); return; }
    const pos = getPosFromEvent(e.clientX, e.clientY);
    setHoverPos(pos);
  };

  const handleMouseLeave = () => setHoverPos(null);

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchEnd={handleTouch}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer rounded-lg shadow-lg"
        style={{ touchAction: 'none' }}
      />
      {/* 착수 확인 버튼 */}
      {confirmMode && previewPos && (
        <div className="flex gap-2 w-full max-w-[300px]">
          <button
            onClick={onConfirmMove}
            className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm
                       active:scale-95 transition-all shadow-lg shadow-emerald-600/30"
          >
            착수 확인
          </button>
          <button
            onClick={onCancelMove}
            className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 font-bold text-sm
                       active:scale-95 transition-all"
          >
            취소
          </button>
        </div>
      )}
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
