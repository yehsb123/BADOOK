'use client';

import React, { useState, useEffect } from 'react';
import { GameRecord, getHistory, getStats, clearHistory } from '@/lib/history';

interface GameHistoryProps {
  onClose: () => void;
}

export default function GameHistory({ onClose }: GameHistoryProps) {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, draws: 0 });

  useEffect(() => {
    setRecords(getHistory());
    setStats(getStats());
  }, []);

  const handleClear = () => {
    if (confirm('기록을 모두 삭제하시겠습니까?')) {
      clearHistory();
      setRecords([]);
      setStats({ total: 0, wins: 0, losses: 0, draws: 0 });
    }
  };

  const diffLabel = (d: string) =>
    d === 'easy' ? '하' : d === 'medium' ? '중' : '상';

  const diffColor = (d: string) =>
    d === 'easy'
      ? 'text-emerald-400'
      : d === 'medium'
        ? 'text-amber-400'
        : 'text-red-400';

  const resultLabel = (r: string) =>
    r === 'win' ? '승' : r === 'lose' ? '패' : '무';

  const resultColor = (r: string) =>
    r === 'win'
      ? 'bg-blue-500/20 text-blue-400'
      : r === 'lose'
        ? 'bg-red-500/20 text-red-400'
        : 'bg-gray-500/20 text-gray-400';

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${m}/${day} ${h}:${min}`;
  };

  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-sm space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            메뉴
          </button>
          <h1 className="text-white font-bold text-base">대국 기록</h1>
          <button
            onClick={handleClear}
            className="text-gray-600 hover:text-red-400 transition-colors text-xs"
          >
            전체 삭제
          </button>
        </div>

        {/* 전적 요약 */}
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-2xl font-black text-white">{stats.total}</div>
              <div className="text-[10px] text-gray-500">총 대국</div>
            </div>
            <div>
              <div className="text-2xl font-black text-blue-400">{stats.wins}</div>
              <div className="text-[10px] text-gray-500">승</div>
            </div>
            <div>
              <div className="text-2xl font-black text-red-400">{stats.losses}</div>
              <div className="text-[10px] text-gray-500">패</div>
            </div>
            <div>
              <div className="text-2xl font-black text-gray-400">{stats.draws}</div>
              <div className="text-[10px] text-gray-500">무</div>
            </div>
          </div>

          {/* 승률 바 */}
          {stats.total > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">승률</span>
                <span className="text-white font-bold">{winRate}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all"
                  style={{ width: `${winRate}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 기록 리스트 */}
        {records.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">아직 기록이 없습니다</p>
            <p className="text-xs mt-1">대국을 완료하면 여기에 기록됩니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(record => (
              <div
                key={record.id}
                className="bg-gray-900/80 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {/* 결과 뱃지 */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm ${resultColor(record.result)}`}>
                    {resultLabel(record.result)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">
                        {record.boardSize}x{record.boardSize}
                      </span>
                      <span className={`text-xs font-medium ${diffColor(record.difficulty)}`}>
                        {diffLabel(record.difficulty)}
                      </span>
                      <span className="text-gray-600 text-xs">
                        {record.playerColor === 'black' ? '흑' : '백'}
                      </span>
                    </div>
                    <div className="text-gray-500 text-[10px] mt-0.5">
                      {record.blackScore}점 vs {record.whiteScore}점 / {record.moveCount}수
                    </div>
                  </div>
                </div>
                <div className="text-gray-600 text-[10px]">
                  {formatDate(record.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
