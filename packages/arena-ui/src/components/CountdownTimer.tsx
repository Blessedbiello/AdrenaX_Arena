'use client';

import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetDate: string | Date;
  label?: string;
  onExpire?: () => void;
}

function formatTime(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds };
}

export default function CountdownTimer({ targetDate, label, onExpire }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const target = new Date(targetDate).getTime();
    const update = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        onExpire?.();
        return;
      }
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  if (timeLeft <= 0) {
    return <span className="text-arena-red font-bold">EXPIRED</span>;
  }

  const { days, hours, minutes, seconds } = formatTime(timeLeft);

  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-arena-muted text-xs mb-1">{label}</span>}
      <div className="flex gap-1 font-mono text-lg">
        {days > 0 && (
          <>
            <span className="bg-arena-card px-2 py-1 rounded">{days}d</span>
            <span className="text-arena-muted">:</span>
          </>
        )}
        <span className="bg-arena-card px-2 py-1 rounded">{String(hours).padStart(2, '0')}</span>
        <span className="text-arena-muted">:</span>
        <span className="bg-arena-card px-2 py-1 rounded">{String(minutes).padStart(2, '0')}</span>
        <span className="text-arena-muted">:</span>
        <span className="bg-arena-card px-2 py-1 rounded">{String(seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
