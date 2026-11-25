import { onPage } from "./lifecycle";

onPage((signal, cleanup) => {
  const viewport = document.querySelector<HTMLElement>("[data-pulse-viewport]");
  if (!viewport) return;

  const progressPath = document.querySelector<SVGPathElement>(
    "[data-pulse-progress-path]",
  );
  const progressBar = document.querySelector<HTMLElement>("[data-pulse-bar]");
  const liveDot = document.querySelector<SVGCircleElement>("[data-pulse-dot]");
  const liveHalo = document.querySelector<SVGCircleElement>("[data-pulse-halo]");
  const stationBtns = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-station-jump]"),
  ];
  const desktopQuery = matchMedia("(min-width: 900px)");
  const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const stageWidth = 2460;

  let pathLength = 0;
  if (progressPath) {
    pathLength = progressPath.getTotalLength();
    progressPath.style.strokeDasharray = `${pathLength} ${pathLength}`;
    progressPath.style.strokeDashoffset = String(pathLength);
  }

  let pinnedStation: number | null = null;
  const setActiveStation = (activeIndex: number) => {
    stationBtns.forEach((btn, idx) => {
      if (idx === activeIndex) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });
  };

  let syncQueued = false;
  const syncScrollUI = () => {
    syncQueued = false;
    if (signal.aborted) return;

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, viewport.scrollLeft / maxScroll)) : 1;

    if (progressPath && pathLength > 0) {
      const startReach = Math.min(1, (viewport.clientWidth * 0.45) / stageWidth);
      const frac = startReach + (1 - startReach) * ratio;
      progressPath.style.strokeDashoffset = String(pathLength * (1 - frac));
    }

    if (progressBar) {
      progressBar.style.transform = `scaleX(${Math.max(0.06, ratio)})`;
    }

    if (stationBtns.length > 0 && pinnedStation === null) {
      let activeIndex = 0;
      if (maxScroll > 0 && viewport.scrollLeft >= maxScroll - 4) {
        activeIndex = stationBtns.length - 1;
      } else if (viewport.scrollLeft > 4) {
        const viewCenter = viewport.scrollLeft + viewport.clientWidth * 0.5;
        let bestDist = Infinity;
        stationBtns.forEach((btn, idx) => {
          const x = Number(btn.dataset.stationX || 0);
          const dist = Math.abs(x - viewCenter);
          if (dist < bestDist) {
            bestDist = dist;
            activeIndex = idx;
          }
        });
      }
      setActiveStation(activeIndex);
    }
  };

  const queueSync = () => {
    if (!syncQueued) {
      syncQueued = true;
      requestAnimationFrame(syncScrollUI);
    }
  };

  const scrollToStation = (index: number) => {
    const clamped = Math.max(0, Math.min(stationBtns.length - 1, index));
    const btn = stationBtns[clamped];
    if (!btn) return;
    pinnedStation = clamped;
    setActiveStation(clamped);
    const x = Number(btn.dataset.stationX || 0);
    const target = Math.max(
      0,
      Math.min(
        viewport.scrollWidth - viewport.clientWidth,
        x - viewport.clientWidth * 0.5,
      ),
    );
    viewport.scrollTo({
      left: target,
      behavior: reducedMotionQuery.matches ? "auto" : "smooth",
    });
  };

  stationBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => scrollToStation(idx), { signal });
  });

  // Translate vertical wheel to horizontal scroll on desktop
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!desktopQuery.matches) return;
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      if (maxScroll <= 0) return;
      pinnedStation = null;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        viewport.scrollLeft += event.deltaY;
      }
    },
    { passive: false, signal },
  );

  // Drag-to-pan on non-interactive surface
  let dragging = false;
  let pointerId = -1;
  let startX = 0;
  let startScrollLeft = 0;
  let moved = false;

  viewport.addEventListener(
    "pointerdown",
    (event) => {
      if (!desktopQuery.matches || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, input, select, label")) return;
      pinnedStation = null;
      dragging = true;
      moved = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = viewport.scrollLeft;
    },
    { signal },
  );

  viewport.addEventListener(
    "pointermove",
    (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        viewport.classList.add("is-dragging");
        viewport.setPointerCapture(pointerId);
      }
      if (moved) {
        viewport.scrollLeft = startScrollLeft - dx;
      }
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    if (viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }
  };
  viewport.addEventListener("pointerup", endDrag, { signal });
  viewport.addEventListener("pointercancel", endDrag, { signal });

  // Keyboard Left/Right navigation between stations
  window.addEventListener(
    "keydown",
    (event) => {
      if (!desktopQuery.matches) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (
        active &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
      ) {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const current = stationBtns.findIndex(
        (btn) => btn.getAttribute("aria-current") === "true",
      );
      const base = pinnedStation ?? (current >= 0 ? current : 0);
      scrollToStation(base + (event.key === "ArrowRight" ? 1 : -1));
    },
    { signal },
  );

  viewport.addEventListener("scroll", queueSync, { passive: true, signal });
  window.addEventListener("resize", queueSync, { signal });

  // Traveling signal dot along the ECG path while music plays
  let dotRaf = 0;
  let dotStart = 0;
  const cycleMs = 9500;

  const stopDot = () => {
    if (dotRaf) {
      cancelAnimationFrame(dotRaf);
      dotRaf = 0;
    }
  };

  const tickDot = (now: number) => {
    if (
      signal.aborted ||
      !progressPath ||
      pathLength <= 0 ||
      document.documentElement.dataset.musicPlaying !== "true" ||
      reducedMotionQuery.matches ||
      document.hidden
    ) {
      dotRaf = 0;
      return;
    }
    if (!dotStart) dotStart = now;
    const progress = ((now - dotStart) % cycleMs) / cycleMs;
    const pt = progressPath.getPointAtLength(progress * pathLength);
    if (liveDot) {
      liveDot.setAttribute("cx", pt.x.toFixed(1));
      liveDot.setAttribute("cy", pt.y.toFixed(1));
    }
    if (liveHalo) {
      liveHalo.setAttribute("cx", pt.x.toFixed(1));
      liveHalo.setAttribute("cy", pt.y.toFixed(1));
    }
    dotRaf = requestAnimationFrame(tickDot);
  };

  const syncDotState = () => {
    const playing =
      document.documentElement.dataset.musicPlaying === "true" &&
      !reducedMotionQuery.matches &&
      !document.hidden;
    if (playing && !dotRaf) {
      dotStart = 0;
      dotRaf = requestAnimationFrame(tickDot);
    } else if (!playing) {
      stopDot();
    }
  };

  const observer = new MutationObserver(syncDotState);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-music-playing"],
  });
  document.addEventListener("visibilitychange", syncDotState, { signal });
  reducedMotionQuery.addEventListener("change", syncDotState, { signal });

  cleanup(() => {
    stopDot();
    observer.disconnect();
  });

  syncScrollUI();
  syncDotState();
});
