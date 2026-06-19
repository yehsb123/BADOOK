'use client';

import React from 'react';
import { GameState, Stone } from '@/lib/game-engine';
import { Difficulty } from '@/lib/ai-engine';

interface GamePanelProps {
  gameState: GameState;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onPass: () => void;
  onResign: () => void;
  onNewGame: () => void;
  onBoardSizeChange: (size: number) => void;
  isAIThinking: boolean;
  playerColor: Stone;
  scoreInfo?: {
    blackTerritory: number;
    whiteTerritory: number;
    blackScore: number;
    whiteScore: number;
    winner: string;
  } | null;
}

export default function GamePanel({
  gameState,
  difficulty,
  onDifficultyChange,
  onPass,
  onResign,
  onNewGame,
  onBoardSizeChange,
  isAIThinking,
  playerColor,
  scoreInfo,
}: GamePanelProps) {
  const moveCount = gameState.moveHistory.length;
  const isMyTurn = gameState.currentPlayer === playerColor && !gameState.isGameOver;

  return (
    <div className="w-full max-w-[500px] space-y-3">
      {/* 상태 바 */}
      <div className="flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl px-4 py-3 shadow-md">
        <div className="flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded-full border-2 shadow-inner ${
              gameState.currentPlayer === 'black'
                ? 'bg-gray-900 border-gray-600'
                : 'bg-white border-gray-300'
            }`}
          />
          <span className="text-white font-medium text-sm">
            {gameState.isGameOver
              ? '대국 종료'
              : isAIThinking
                ? 'AI 생각 중...'
                : isMyTurn
                  ? '당신의 차례'
                  : 'AI 차례'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>수순 {moveCount}</span>
        </div>
      </div>

      {/* AI 사고 인디케이터 */}
      {isAIThinking && (
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-shimmer rounded-full" />
        </div>
      )}

      {/* 점수판 */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl p-3 ${
          playerColor === 'black' ? 'bg-gray-900 ring-2 ring-blue-500/50' : 'bg-gray-900'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-full bg-gray-900 border-2 border-gray-500 shadow-inner" />
            <span className="text-white text-sm font-semibold">
              흑 {playerColor === 'black' ? '(나)' : '(AI)'}
            </span>
          </div>
          <div className="text-gray-400 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>잡은 돌</span>
              <span className="text-white font-mono">{gameState.capturedByBlack}</span>
            </div>
            {scoreInfo && (
              <>
                <div className="flex justify-between">
                  <span>집</span>
                  <span className="text-white font-mono">{scoreInfo.blackTerritory}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-0.5 mt-0.5">
                  <span className="font-semibold">총점</span>
                  <span className="text-yellow-400 font-mono font-bold">{scoreInfo.blackScore}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`rounded-xl p-3 ${
          playerColor === 'white' ? 'bg-gray-900 ring-2 ring-blue-500/50' : 'bg-gray-900'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-full bg-white border-2 border-gray-300" />
            <span className="text-white text-sm font-semibold">
              백 {playerColor === 'white' ? '(나)' : '(AI)'}
            </span>
          </div>
          <div className="text-gray-400 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>잡은 돌</span>
              <span className="text-white font-mono">{gameState.capturedByWhite}</span>
            </div>
            <div className="flex justify-between">
              <span>덤</span>
              <span className="text-white font-mono">{gameState.komi}</span>
            </div>
            {scoreInfo && (
              <>
                <div className="flex justify-between">
                  <span>집</span>
                  <span className="text-white font-mono">{scoreInfo.whiteTerritory}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-0.5 mt-0.5">
                  <span className="font-semibold">총점</span>
                  <span className="text-yellow-400 font-mono font-bold">{scoreInfo.whiteScore}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 승리 배너 */}
      {gameState.isGameOver && scoreInfo && (
        <div className="bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border border-yellow-500/30 rounded-xl p-4 text-center">
          <div className="text-yellow-400 font-bold text-lg">{scoreInfo.winner}</div>
          <p className="text-gray-400 text-xs mt-1">
            흑 {scoreInfo.blackScore}점 vs 백 {scoreInfo.whiteScore}점
          </p>
        </div>
      )}

      {/* 게임 컨트롤 */}
      <div className="flex gap-2">
        <button
          onClick={onPass}
          disabled={gameState.isGameOver || isAIThinking || !isMyTurn}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                     bg-gray-800 text-gray-300 hover:bg-gray-700 active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          패스
        </button>
        <button
          onClick={onResign}
          disabled={gameState.isGameOver}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                     bg-red-900/40 text-red-400 hover:bg-red-900/60 active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          기권
        </button>
        <button
          onClick={onNewGame}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                     bg-blue-900/40 text-blue-400 hover:bg-blue-900/60 active:scale-95"
        >
          새 대국
        </button>
      </div>

      {/* 설정 */}
      <div className="bg-gray-900/60 rounded-xl p-3 space-y-3">
        {/* 난이도 선택 */}
        <div>
          <label className="text-gray-500 text-xs font-medium block mb-1.5">AI 난이도</label>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { key: 'easy' as Difficulty, label: '하', desc: '입문자용', color: 'emerald' },
              { key: 'medium' as Difficulty, label: '중', desc: '중급자용', color: 'amber' },
              { key: 'hard' as Difficulty, label: '상', desc: '고급자용', color: 'red' },
            ]).map(d => (
              <button
                key={d.key}
                onClick={() => onDifficultyChange(d.key)}
                className={`py-2 rounded-lg text-center transition-all active:scale-95 ${
                  difficulty === d.key
                    ? d.color === 'emerald'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : d.color === 'amber'
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                        : 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <div className="font-bold text-sm">{d.label}</div>
                <div className="text-[10px] opacity-70">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 바둑판 크기 */}
        <div>
          <label className="text-gray-500 text-xs font-medium block mb-1.5">바둑판 크기</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[9, 13, 19].map(s => (
              <button
                key={s}
                onClick={() => onBoardSizeChange(s)}
                className={`py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                  gameState.boardSize === s
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s}x{s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 규칙 안내 */}
      <details className="bg-gray-900/40 rounded-xl">
        <summary className="px-3 py-2 text-gray-500 text-xs font-medium cursor-pointer hover:text-gray-400 transition-colors">
          바둑 규칙 안내
        </summary>
        <div className="px-3 pb-3 text-gray-500 text-xs space-y-1.5 leading-relaxed">
          <p><strong className="text-gray-400">착수:</strong> 빈 교차점에 돌을 놓습니다. 흑이 먼저 시작합니다.</p>
          <p><strong className="text-gray-400">활로:</strong> 돌에 인접한 빈 칸입니다. 활로가 모두 막히면 돌이 잡힙니다.</p>
          <p><strong className="text-gray-400">따냄:</strong> 상대 돌의 활로를 모두 막으면 잡아서 제거합니다.</p>
          <p><strong className="text-gray-400">패(Ko):</strong> 직전 상태를 되풀이하는 착수는 금지됩니다.</p>
          <p><strong className="text-gray-400">자충수 금지:</strong> 놓자마자 활로가 0이 되는 곳에는 둘 수 없습니다 (상대를 잡는 경우 제외).</p>
          <p><strong className="text-gray-400">계가:</strong> 양 플레이어가 연속 패스하면 대국이 종료되고, 집 + 잡은 돌 수로 승패를 가립니다.</p>
          <p><strong className="text-gray-400">덤:</strong> 백에게 6.5점의 덤(komi)이 주어집니다.</p>
        </div>
      </details>
    </div>
  );
}
