import { useEffect, useRef, useState } from "react";

/** True when the visitor asked the OS for reduced motion. Autoplaying sequences stop; content stays visible. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Adds `is-in` to every `.reveal` element inside the returned ref once it scrolls into view (fade-up on scroll). */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * Steps through 0..n-1 every `ms` while the element is on screen. `select(i)` jumps to a step and pauses autoplay
 * for `holdMs`, so a visitor who clicks or hovers is not interrupted. `tick` only ever increases (used for continuous rotation).
 */
export function useCycle(n: number, ms: number, holdMs = 8000) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const holdUntil = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setVisible(true); return; }
    const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || !visible) return;
    const t = setInterval(() => { if (Date.now() >= holdUntil.current) setTick((x) => x + 1); }, ms);
    return () => clearInterval(t);
  }, [ms, reduced, visible]);
  const select = (i: number) => {
    holdUntil.current = Date.now() + holdMs;
    setTick((x) => x + ((i - (x % n) + n) % n));
  };
  return { ref, active: tick % n, tick, select };
}

/**
 * Continuous orbit: a marker travels round a circle (one lap = n * stepMs) and `active` changes as it reaches each
 * station. The marker transform is written straight to `markerRef` every frame (no re-render). `select(i)` moves the
 * marker to station i and the lap continues from there. Reduced motion: no orbit, the marker sits on the selected step.
 */
export function useOrbit(n: number, stepMs: number, cx: number, cy: number) {
  const reduced = useReducedMotion();
  const markerRef = useRef<SVGGElement>(null);
  const [active, setActive] = useState(0);
  const [lap, setLap] = useState(0); // increments on every step change (restarts the trail animation)
  const t0 = useRef(0);
  const place = (deg: number) => markerRef.current?.setAttribute("transform", `rotate(${deg} ${cx} ${cy})`);
  useEffect(() => {
    if (reduced) return;
    t0.current = performance.now();
    let last = -1, raf = 0;
    const loop = (now: number) => {
      const el = now - t0.current;
      place(((el / (stepMs * n)) * 360) % 360);
      const s = Math.floor(el / stepMs) % n;
      if (s !== last) { last = s; setActive(s); setLap((x) => x + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, n, stepMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = (i: number) => {
    if (reduced) { setActive(i); setLap((x) => x + 1); place((360 / n) * i); return; }
    t0.current = performance.now() - i * stepMs;
  };
  return { markerRef, active, lap, select, reduced };
}

/**
 * Plays 0 -> n-1 quickly each time the element scrolls into view, then stops on the last step.
 * Leaving the view resets to 0, so scrolling back up and down replays from step 1. `select(i)` stops autoplay.
 */
export function useStepsOnView(n: number, stepMs: number) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const stop = () => clearInterval(timer.current);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setActive(n - 1); return; }
    const io = new IntersectionObserver(([en]) => {
      stop();
      if (!en.isIntersecting) { setActive(0); return; }
      if (reduced) { setActive(n - 1); return; }
      setActive(0);
      timer.current = setInterval(() => setActive((a) => { if (a >= n - 1) { stop(); return a; } return a + 1; }), stepMs);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); stop(); };
  }, [n, stepMs, reduced]);
  const select = (i: number) => { stop(); setActive(i); };
  return { ref, active, select };
}
