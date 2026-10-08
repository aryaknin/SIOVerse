"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function SioCursor() {
  const pathname = usePathname();
  const core = useRef<HTMLSpanElement>(null);
  const halo = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const cursor = root.current;
    const point = core.current;
    const follower = halo.current;
    if (!cursor || !point || !follower) return;

    let targetX = -100;
    let targetY = -100;
    let haloX = -100;
    let haloY = -100;
    let frame = 0;

    const draw = () => {
      haloX += (targetX - haloX) * 0.2;
      haloY += (targetY - haloY) * 0.2;
      follower.style.transform = `translate3d(${haloX}px, ${haloY}px, 0) translate(-50%, -50%)`;
      frame = window.requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (haloX < 0) { haloX = targetX; haloY = targetY; }
      point.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
      cursor.classList.add("is-visible");
      const hovered = event.target instanceof Element ? event.target : null;
      cursor.classList.toggle("is-interactive", Boolean(hovered?.closest("a, button, [role='button'], summary, label")));
      cursor.classList.toggle("is-text", Boolean(hovered?.closest("input, textarea, select, [contenteditable='true']")));
    };
    const hide = () => cursor.classList.remove("is-visible");
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) hide(); };
    const press = () => cursor.classList.add("is-pressed");
    const release = () => cursor.classList.remove("is-pressed");

    document.documentElement.classList.add("has-sio-cursor");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave);
    window.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", hide);
    frame = window.requestAnimationFrame(draw);
    return () => {
      document.documentElement.classList.remove("has-sio-cursor");
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", hide);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={root} className={`sio-cursor ${pathname.startsWith("/sioverse") ? "sio-cursor-verse" : ""}`} aria-hidden="true">
    <span ref={halo} className="sio-cursor-halo"><span>↗</span></span>
    <span ref={core} className="sio-cursor-core" />
  </div>;
}
