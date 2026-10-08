"use client";

import { useEffect, useState } from "react";

export function StatusClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  if (!now) return <span className="clock">--:--</span>;
  return (
    <span className="clock">
      <strong>{now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</strong>
      <small>{now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</small>
    </span>
  );
}
