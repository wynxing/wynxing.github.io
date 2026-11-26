import { onPage } from "./lifecycle";

interface PulseAudioBridge {
  isPlaying: () => boolean;
  getLevel: () => number;
  getBins: () => Uint8Array | null;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

onPage((signal, cleanup) => {
  const viewportEl = document.querySelector<HTMLElement>("[data-pulse-viewport]");
  const stageEl = document.querySelector<HTMLElement>("[data-pulse-stage]");
  const canvasEl = document.querySelector<HTMLCanvasElement>("[data-pulse-canvas]");
  if (!viewportEl || !stageEl || !canvasEl) return;

  const ctxRaw = canvasEl.getContext("2d");
  if (!ctxRaw) return;

  const viewport: HTMLElement = viewportEl;
  const stage: HTMLElement = stageEl;
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = ctxRaw;

  const progressBar = document.querySelector<HTMLElement>("[data-pulse-bar]");
  const bpmEl = document.querySelector<HTMLElement>("[data-pulse-bpm]");
  const stationEls = [
    ...document.querySelectorAll<HTMLElement>("[data-pulse-station]"),
  ];
  const mirrorEls = [
    ...document.querySelectorAll<HTMLElement>("[data-pulse-mirror]"),
  ];
  const stationBtns = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-station-jump]"),
  ];

  const desktopQuery = matchMedia("(min-width: 900px)");
  const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const stageWidth = 2200;
  const MID_RATIO = 0.48;
  const stationPositions = stationEls.map((el) =>
    Number(el.dataset.stationX || 0),
  );
  const aboveEls = stationEls.map((el, idx) => {
    if (el.classList.contains("is-above")) return el;
    return (
      mirrorEls.find(
        (m) =>
          Number(m.dataset.pulseMirror) === idx &&
          m.classList.contains("is-above"),
      ) ?? null
    );
  });
  const belowEls = stationEls.map((el, idx) => {
    if (el.classList.contains("is-below")) return el;
    return (
      mirrorEls.find(
        (m) =>
          Number(m.dataset.pulseMirror) === idx &&
          m.classList.contains("is-below"),
      ) ?? null
    );
  });

  // Inertial horizontal scroll state
  let currentX = 0;
  let targetX = 0;
  let scrollVelocity = 0;
  let pinnedStation: number | null = null;
  let hoveredStation: number | null = null;

  // Clinical ECG monitor ring buffer (desktop horizontal & mobile vertical)
  const COL_STEP = 1.5;
  let cols = 0;
  let trace = new Float32Array(0);
  let sweepCol = 0;
  let beatPhase = 0.38;
  let smoothedBpm = 64;
  let extraPulseBoost = 0;
  let tapBpmBoost = 0;
  let beatGlow = 0;
  let lastLayoutWidth = 0;

  // Taut 1D spring-damper string physics layered onto desktop baseline
  const STRING_N = 180;
  const disp = new Float32Array(STRING_N);
  const vel = new Float32Array(STRING_N);
  const ripples: Ripple[] = [];

  // Pointer telemetry
  let pointerActive = false;
  let pointerAlpha = 0;
  let pointerX = 0;
  let pointerY = 0;
  let prevPointerY = 0;

  // Offscreen ECG chart-paper pattern & spotlight reveal buffer
  const TILE_SIZE = 60;
  const SPOT_SIZE = 460;
  const SPOT_HALF = SPOT_SIZE / 2;
  let lightPattern: CanvasPattern | null = null;
  let darkPattern: CanvasPattern | null = null;
  let spotCanvas: HTMLCanvasElement | null = null;
  let spotCtx: CanvasRenderingContext2D | null = null;
  let spotDpr = 0;

  // Mobile vertical ECG state
  let mRows = 0;
  let mTrace = new Float32Array(0);
  let mSweepRow = 0;
  let mBeatPhase = 0.38;
  let lastLayoutHeight = 0;
  let mobileScrollSpeed = 0;
  let lastWindowScrollY = typeof window !== "undefined" ? window.scrollY : 0;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastTime = 0;
  let lastBpmText = "";

  const getMaxScroll = () => Math.max(0, stageWidth - viewport.clientWidth);

  const getPaperPattern = (isDark: boolean): CanvasPattern | null => {
    if (isDark && darkPattern) return darkPattern;
    if (!isDark && lightPattern) return lightPattern;
    const tile = document.createElement("canvas");
    tile.width = TILE_SIZE;
    tile.height = TILE_SIZE;
    const tctx = tile.getContext("2d");
    if (!tctx) return null;

    const minor = isDark ? "rgba(255,255,255,0.08)" : "rgba(180,72,32,0.10)";
    const major = isDark ? "rgba(255,120,60,0.17)" : "rgba(180,72,32,0.20)";
    const dot = isDark ? "rgba(255,77,0,0.35)" : "rgba(230,62,0,0.30)";

    tctx.lineWidth = 1;
    tctx.strokeStyle = minor;
    tctx.beginPath();
    for (let pos = 12; pos < TILE_SIZE; pos += 12) {
      tctx.moveTo(pos + 0.5, 0);
      tctx.lineTo(pos + 0.5, TILE_SIZE);
      tctx.moveTo(0, pos + 0.5);
      tctx.lineTo(TILE_SIZE, pos + 0.5);
    }
    tctx.stroke();

    tctx.strokeStyle = major;
    tctx.beginPath();
    tctx.moveTo(0.5, 0);
    tctx.lineTo(0.5, TILE_SIZE);
    tctx.moveTo(0, 0.5);
    tctx.lineTo(TILE_SIZE, 0.5);
    tctx.stroke();

    tctx.fillStyle = dot;
    tctx.beginPath();
    tctx.arc(0.5, 0.5, 1.1, 0, Math.PI * 2);
    tctx.fill();

    const pat = ctx.createPattern(tile, "repeat");
    if (isDark) darkPattern = pat;
    else lightPattern = pat;
    return pat;
  };

  const ensureSpotCanvas = (): CanvasRenderingContext2D | null => {
    if (!spotCanvas) {
      spotCanvas = document.createElement("canvas");
      spotCtx = spotCanvas.getContext("2d");
    }
    if (!spotCanvas || !spotCtx) return null;
    if (spotDpr !== dpr) {
      spotDpr = dpr;
      spotCanvas.width = Math.round(SPOT_SIZE * dpr);
      spotCanvas.height = Math.round(SPOT_SIZE * dpr);
    }
    return spotCtx;
  };

  const drawPaperReveal = (
    cx: number,
    cy: number,
    radius: number,
    strength: number,
    offsetX: number,
    offsetY: number,
    pattern: CanvasPattern | null,
  ) => {
    if (!pattern || strength <= 0.01 || radius <= 4) return;
    const sc = ensureSpotCanvas();
    if (!sc || !spotCanvas) return;

    const r = Math.min(SPOT_HALF, radius);
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, SPOT_SIZE, SPOT_SIZE);

    sc.save();
    sc.translate(SPOT_HALF - cx - offsetX, SPOT_HALF - cy - offsetY);
    sc.fillStyle = pattern;
    sc.fillRect(
      cx + offsetX - SPOT_HALF,
      cy + offsetY - SPOT_HALF,
      SPOT_SIZE,
      SPOT_SIZE,
    );
    sc.restore();

    sc.globalCompositeOperation = "destination-in";
    const grad = sc.createRadialGradient(
      SPOT_HALF,
      SPOT_HALF,
      0,
      SPOT_HALF,
      SPOT_HALF,
      r,
    );
    grad.addColorStop(0, `rgba(0,0,0,${strength.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(0,0,0,${(strength * 0.55).toFixed(3)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, SPOT_SIZE, SPOT_SIZE);
    sc.globalCompositeOperation = "source-over";

    ctx.drawImage(
      spotCanvas,
      cx - SPOT_HALF,
      cy - SPOT_HALF,
      SPOT_SIZE,
      SPOT_SIZE,
    );
  };

  const drawRadialPool = (
    x: number,
    y: number,
    radius: number,
    innerColor: string,
    midColor: string,
  ) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.5, midColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };

  const injectImpulseAtScreenX = (screenX: number, strength: number) => {
    if (!desktopQuery.matches || reducedMotionQuery.matches || width <= 0) return;
    const normX = Math.max(0, Math.min(1, screenX / width));
    const centerIdx = normX * (STRING_N - 1);
    for (let i = 0; i < STRING_N; i++) {
      const d = Math.abs(i - centerIdx);
      if (d < 8) {
        vel[i] += strength * Math.exp(-(d * d) / 10);
      }
    }
  };

  const sampleStringDisp = (screenX: number): number => {
    if (width <= 0) return 0;
    const idxFloat =
      (Math.max(0, Math.min(width, screenX)) / width) * (STRING_N - 1);
    const i0 = Math.max(0, Math.min(STRING_N - 2, Math.floor(idxFloat)));
    const frac = idxFloat - i0;
    return disp[i0] * (1 - frac) + disp[i0 + 1] * frac;
  };

  const spawnRipple = (x: number, y: number, maxAge = 0.55) => {
    if (!desktopQuery.matches || reducedMotionQuery.matches) return;
    ripples.push({ x, y, age: 0, maxAge });
    if (ripples.length > 8) ripples.shift();
  };

  /**
   * Authentic clinical P-QRS-T waveform kernel.
   * Returns upward displacement in px (draw at midY - value).
   */
  const ecgValue = (phase: number, amp: number): number => {
    const p = ((phase % 1) + 1) % 1;
    if (p < 0.08) return 0;
    if (p < 0.17) {
      const t = (p - 0.08) / 0.09;
      return amp * 0.12 * Math.pow(Math.sin(t * Math.PI), 1.6);
    }
    if (p < 0.215) return 0;
    if (p < 0.236) {
      return p < 0.228
        ? -amp * 0.16 * ((p - 0.215) / 0.013)
        : -amp * 0.16 * ((0.236 - p) / 0.008);
    }
    if (p < 0.268) {
      return p < 0.251
        ? amp * Math.pow((p - 0.236) / 0.015, 1.25)
        : amp * Math.pow((0.268 - p) / 0.017, 1.25);
    }
    if (p < 0.296) {
      return p < 0.28
        ? -amp * 0.3 * ((p - 0.268) / 0.012)
        : -amp * 0.3 * ((0.296 - p) / 0.016);
    }
    if (p < 0.365) return 0;
    if (p < 0.52) {
      const t = (p - 0.365) / 0.155;
      return amp * 0.24 * Math.pow(Math.sin(Math.pow(t, 1.32) * Math.PI), 1.35);
    }
    return 0;
  };

  /**
   * Sub-sample across [p0, p1] so narrow QRS spikes never get attenuated by step width.
   */
  const sampleEcgPeak = (p0: number, p1: number, amp: number): number => {
    if (p1 === p0) return ecgValue(p0, amp);
    let best = 0;
    let bestAbs = -1;
    const samples = 5;
    for (let k = 0; k < samples; k++) {
      const p = p0 + ((p1 - p0) * (k + 0.5)) / samples;
      const v = ecgValue(p, amp);
      const av = Math.abs(v);
      if (av > bestAbs) {
        bestAbs = av;
        best = v;
      }
    }
    return best;
  };

  const getMaxSafeAmp = () => (window.innerHeight <= 780 ? 28 : 36);

  const prefillDesktopTrace = () => {
    cols = Math.max(2, Math.ceil(width / COL_STEP) + 1);
    trace = new Float32Array(cols);
    const headCol = Math.floor(cols * 0.62);
    sweepCol = headCol;
    const baseSpeedPx = 170;
    const dtPerCol = COL_STEP / baseSpeedPx;
    const dPhase = (64 / 60) * dtPerCol;
    const amp = Math.min(getMaxSafeAmp(), 24);
    const headPhase = 0.38;

    for (let age = 0; age < cols; age++) {
      const col = (((headCol - age) % cols) + cols) % cols;
      const p1 = headPhase - age * dPhase;
      const p0 = p1 - dPhase;
      trace[col] = sampleEcgPeak(p0, p1, amp);
    }
    beatPhase = headPhase;
  };

  const prefillMobileTrace = () => {
    const stepPx = 2;
    mRows = Math.max(2, Math.ceil(height / stepPx) + 1);
    mTrace = new Float32Array(mRows);
    const headRow = Math.floor(mRows * 0.45);
    mSweepRow = headRow;
    const baseSpeedPx = 140;
    const dtPerRow = stepPx / baseSpeedPx;
    const dPhase = (64 / 60) * dtPerRow;
    const amp = 15;
    const headPhase = 0.38;

    for (let age = 0; age < mRows; age++) {
      const row = (((headRow - age) % mRows) + mRows) % mRows;
      const p1 = headPhase - age * dPhase;
      const p0 = p1 - dPhase;
      mTrace[row] = sampleEcgPeak(p0, p1, amp);
    }
    mBeatPhase = headPhase;
  };

  const triggerBeat = (boost = 0.65) => {
    if (!desktopQuery.matches || reducedMotionQuery.matches) return;
    extraPulseBoost = Math.max(extraPulseBoost, boost);
    if (beatPhase > 0.52 || beatPhase < 0.06) {
      beatPhase = 0.212;
    }
  };

  const setActiveStation = (activeIndex: number) => {
    stationBtns.forEach((btn, idx) => {
      if (idx === activeIndex) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });
  };

  const syncRailUI = () => {
    const maxScroll = getMaxScroll();
    const ratio =
      maxScroll > 0 ? Math.min(1, Math.max(0, currentX / maxScroll)) : 1;

    if (progressBar) {
      progressBar.style.transform = `scaleX(${Math.max(0.06, ratio)})`;
    }

    if (stationBtns.length > 0 && pinnedStation === null) {
      let activeIndex = 0;
      if (maxScroll > 0 && currentX >= maxScroll - 6) {
        activeIndex = stationBtns.length - 1;
      } else if (currentX > 6) {
        const viewCenter = currentX + viewport.clientWidth * 0.5;
        let bestDist = Infinity;
        stationPositions.forEach((sx, idx) => {
          const dist = Math.abs(sx - viewCenter);
          if (dist < bestDist) {
            bestDist = dist;
            activeIndex = idx;
          }
        });
      }
      setActiveStation(activeIndex);
    }
  };

  const scrollToStation = (index: number) => {
    const clamped = Math.max(0, Math.min(stationBtns.length - 1, index));
    const sx = stationPositions[clamped];
    if (sx === undefined) return;
    pinnedStation = clamped;
    setActiveStation(clamped);
    const maxScroll = getMaxScroll();
    targetX = Math.max(0, Math.min(maxScroll, sx - viewport.clientWidth * 0.5));
    if (reducedMotionQuery.matches) {
      currentX = targetX;
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
      syncRailUI();
      drawFrame(0);
    }
  };

  stationBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => scrollToStation(idx), { signal });
  });

  // Unified focus spotlight for both primary station and opposite mirror
  const setFocusedIndex = (idx: number | null) => {
    hoveredStation = idx;
    stationEls.forEach((el, i) => el.classList.toggle("is-focused", i === idx));
    mirrorEls.forEach((el) => {
      const mIdx = Number(el.dataset.pulseMirror);
      el.classList.toggle("is-focused", mIdx === idx);
    });
    stage.classList.toggle("has-hover", idx !== null);
  };

  stationEls.forEach((el, idx) => {
    el.addEventListener("pointerenter", () => setFocusedIndex(idx), { signal });
    el.addEventListener(
      "pointerleave",
      () => {
        if (hoveredStation === idx) setFocusedIndex(null);
      },
      { signal },
    );
    el.addEventListener(
      "focusin",
      () => {
        setFocusedIndex(idx);
        if (desktopQuery.matches) {
          const sx = stationPositions[idx] ?? 0;
          const viewLeft = currentX + 120;
          const viewRight = currentX + viewport.clientWidth - 120;
          if (sx < viewLeft || sx > viewRight) scrollToStation(idx);
        }
      },
      { signal },
    );
    el.addEventListener(
      "focusout",
      (event) => {
        const next = event.relatedTarget as Node | null;
        if (next && el.contains(next)) return;
        if (hoveredStation === idx) setFocusedIndex(null);
      },
      { signal },
    );
  });

  mirrorEls.forEach((el) => {
    const idx = Number(el.dataset.pulseMirror);
    el.addEventListener("pointerenter", () => setFocusedIndex(idx), { signal });
    el.addEventListener(
      "pointerleave",
      () => {
        if (hoveredStation === idx) setFocusedIndex(null);
      },
      { signal },
    );
  });

  // Cross-line mirror sync: 项目 -> Above Project Mirror
  const projectMirror = document.querySelector<HTMLElement>("[data-project-mirror]");
  const projectRows = [
    ...document.querySelectorAll<HTMLElement>("[data-project-item]"),
  ];
  if (projectMirror && projectRows.length > 0) {
    const pmStack = projectMirror.querySelector("[data-pm-stack]");
    const pmTitle = projectMirror.querySelector("[data-pm-title]");
    const pmRole = projectMirror.querySelector("[data-pm-role]");
    const pmHighlight = projectMirror.querySelector("[data-pm-highlight]");

    const activateProject = (row: HTMLElement, pulse: boolean) => {
      projectRows.forEach((item) => item.classList.toggle("is-active", item === row));
      if (pmStack) pmStack.textContent = row.dataset.stack || "";
      if (pmTitle) pmTitle.textContent = row.dataset.title || "";
      if (pmRole) pmRole.textContent = row.dataset.role || "";
      if (pmHighlight) pmHighlight.textContent = row.dataset.highlight || "";
      if (pulse) {
        const sx = (stationPositions[1] ?? 840) - currentX;
        injectImpulseAtScreenX(sx, -7);
        spawnRipple(sx, height * MID_RATIO, 0.48);
        triggerBeat(0.55);
      }
    };

    projectRows.forEach((row) => {
      row.addEventListener("pointerenter", () => activateProject(row, true), {
        signal,
      });
      row.addEventListener("focusin", () => activateProject(row, false), {
        signal,
      });
    });
  }

  // Cross-line mirror sync: 文章 -> Below Excerpt Mirror
  const postMirror = document.querySelector<HTMLElement>("[data-post-mirror]");
  const postRows = [
    ...document.querySelectorAll<HTMLElement>("[data-post-item]"),
  ];
  if (postMirror && postRows.length > 0) {
    const wmMeta = postMirror.querySelector("[data-wm-meta]");
    const wmTitle = postMirror.querySelector("[data-wm-title]");
    const wmDesc = postMirror.querySelector("[data-wm-desc]");

    const activatePost = (row: HTMLElement, pulse: boolean) => {
      postRows.forEach((item) => item.classList.toggle("is-active", item === row));
      if (wmMeta) wmMeta.textContent = row.dataset.meta || "";
      if (wmTitle) wmTitle.textContent = row.dataset.title || "";
      if (wmDesc) wmDesc.textContent = row.dataset.desc || "";
      if (pulse) {
        const sx = (stationPositions[2] ?? 1420) - currentX;
        injectImpulseAtScreenX(sx, 7);
        spawnRipple(sx, height * MID_RATIO, 0.48);
        triggerBeat(0.55);
      }
    };

    postRows.forEach((row) => {
      row.addEventListener("pointerenter", () => activatePost(row, true), {
        signal,
      });
      row.addEventListener("focusin", () => activatePost(row, false), {
        signal,
      });
    });
  }

  // Wheel -> inertial horizontal target
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!desktopQuery.matches) return;
      const maxScroll = getMaxScroll();
      if (maxScroll <= 0) return;
      event.preventDefault();
      pinnedStation = null;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      targetX = Math.max(0, Math.min(maxScroll, targetX + delta * 1.15));
    },
    { passive: false, signal },
  );

  // Drag-to-pan + physical cursor plucking
  let dragging = false;
  let pointerId = -1;
  let dragStartX = 0;
  let dragStartTarget = 0;
  let dragLastX = 0;
  let dragVelocity = 0;
  let dragMoved = false;

  viewport.addEventListener(
    "pointerdown",
    (event) => {
      if (!desktopQuery.matches || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, input, select, label")) return;
      pinnedStation = null;
      dragging = true;
      dragMoved = false;
      pointerId = event.pointerId;
      dragStartX = event.clientX;
      dragLastX = event.clientX;
      dragStartTarget = targetX;
      dragVelocity = 0;
    },
    { signal },
  );

  viewport.addEventListener(
    "pointermove",
    (event) => {
      const rect = viewport.getBoundingClientRect();
      const nextY = event.clientY - rect.top;
      prevPointerY = pointerActive ? pointerY : nextY;
      pointerActive = true;
      pointerX = event.clientX - rect.left;
      pointerY = nextY;

      // Pluck the wire cleanly when cursor crosses near baseline
      if (
        desktopQuery.matches &&
        !reducedMotionQuery.matches &&
        width > 0 &&
        !dragging
      ) {
        const midY = height * MID_RATIO;
        const dy = pointerY - prevPointerY;
        if (Math.abs(pointerY - midY) < 58 && Math.abs(dy) > 0.5) {
          const clampedDy = Math.max(-14, Math.min(14, dy * 0.75));
          injectImpulseAtScreenX(pointerX, clampedDy * 0.45);
        }
      }

      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - dragStartX;
      if (!dragMoved && Math.abs(dx) > 4) {
        dragMoved = true;
        viewport.classList.add("is-dragging");
        viewport.setPointerCapture(pointerId);
      }
      if (dragMoved) {
        dragVelocity = dragLastX - event.clientX;
        dragLastX = event.clientX;
        targetX = Math.max(
          0,
          Math.min(getMaxScroll(), dragStartTarget - dx),
        );
      }
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    if (dragMoved) {
      targetX = Math.max(
        0,
        Math.min(getMaxScroll(), targetX + dragVelocity * 10),
      );
    }
    if (viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }
  };
  viewport.addEventListener("pointerup", endDrag, { signal });
  viewport.addEventListener("pointercancel", endDrag, { signal });
  viewport.addEventListener(
    "pointerleave",
    () => {
      pointerActive = false;
    },
    { signal },
  );

  // Click near baseline: pluck wire + ripple ring + accelerate heartbeat
  viewport.addEventListener(
    "click",
    (event) => {
      if (dragMoved || !desktopQuery.matches || reducedMotionQuery.matches) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, input, select, label")) return;
      const rect = viewport.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      if (Math.abs(clickY - height * MID_RATIO) < 90 && width > 0) {
        const col = Math.max(0, Math.min(cols - 1, Math.round(clickX / COL_STEP)));
        const anchorY = height * MID_RATIO - (trace[col] || 0) + sampleStringDisp(clickX);
        injectImpulseAtScreenX(clickX, -15);
        spawnRipple(clickX, anchorY, 0.55);
        tapBpmBoost = Math.min(68, tapBpmBoost + 12);
        triggerBeat(0.8);
      }
    },
    { signal },
  );

  // Keyboard Left/Right navigation
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

  window.addEventListener(
    "scroll",
    () => {
      if (desktopQuery.matches) return;
      const y = window.scrollY;
      mobileScrollSpeed = Math.min(28, Math.abs(y - lastWindowScrollY));
      lastWindowScrollY = y;
    },
    { passive: true, signal },
  );

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!desktopQuery.matches) {
      stage.style.transform = "";
      currentX = 0;
      targetX = 0;
      if (
        mRows === 0 ||
        Math.abs(height - lastLayoutHeight) > 24 ||
        reducedMotionQuery.matches
      ) {
        prefillMobileTrace();
        lastLayoutHeight = height;
      }
    } else {
      const maxScroll = getMaxScroll();
      targetX = Math.max(0, Math.min(maxScroll, targetX));
      currentX = Math.max(0, Math.min(maxScroll, currentX));
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
      if (
        cols === 0 ||
        Math.abs(width - lastLayoutWidth) > 24 ||
        reducedMotionQuery.matches
      ) {
        prefillDesktopTrace();
        lastLayoutWidth = width;
      }
    }
    syncRailUI();
    drawFrame(0);
  };

  function drawFrame(dtSec: number) {
    if (signal.aborted || width <= 0 || height <= 0) return;

    const styles = getComputedStyle(document.documentElement);
    const lineColor =
      styles.getPropertyValue("--pulse-line").trim() || "rgba(128,128,128,0.45)";
    const activeColor =
      styles.getPropertyValue("--text").trim() || "#ffffff";
    const accentColor =
      styles.getPropertyValue("--accent").trim() || "#ff4d00";
    const bgColor = styles.getPropertyValue("--bg").trim() || "#070707";
    const stemColor =
      styles.getPropertyValue("--line-strong").trim() || lineColor;
    const isDark = document.documentElement.dataset.theme === "dark";

    const bridge = (
      window as unknown as { __pulseAudio?: PulseAudioBridge }
    ).__pulseAudio;
    const audioPlaying = Boolean(bridge?.isPlaying());
    const audioLevel = audioPlaying ? bridge?.getLevel() || 0 : 0;

    if (dtSec > 0) {
      beatGlow *= Math.exp(-dtSec * 3.2);
      pointerAlpha +=
        ((pointerActive ? 1 : 0) - pointerAlpha) * Math.min(1, dtSec * 7);
    }

    ctx.clearRect(0, 0, width, height);

    if (!desktopQuery.matches) {
      // Mobile: live vertical clinical ECG sweep along left spine (x = 18)
      const spineX = 18;
      const stepPx = 2;
      if (mRows === 0) prefillMobileTrace();

      mobileScrollSpeed *= 0.9;
      if (!reducedMotionQuery.matches && dtSec > 0) {
        const bpm = 64 + Math.min(36, mobileScrollSpeed * 1.4) + audioLevel * 20;
        const amp = Math.min(
          20,
          15 + audioLevel * 5 + Math.min(4, mobileScrollSpeed * 0.15),
        );
        const sweepSpeedY = 140;
        const rowAdvance = (sweepSpeedY * dtSec) / stepPx;
        const prevFloor = Math.floor(mSweepRow);
        const nextSweep = mSweepRow + rowAdvance;
        const steps = Math.min(mRows, Math.floor(nextSweep) - prevFloor);
        const dtPerRow = stepPx / sweepSpeedY;
        const dPhase = (bpm / 60) * dtPerRow;

        for (let s = 1; s <= steps; s++) {
          const row = (prevFloor + s) % mRows;
          const nextPhase = mBeatPhase + dPhase;
          const prevMod = ((mBeatPhase % 1) + 1) % 1;
          const nextMod = ((nextPhase % 1) + 1) % 1;
          if ((prevMod < 0.251 && nextMod >= 0.251) || nextPhase - mBeatPhase >= 1) {
            beatGlow = Math.min(1, beatGlow + 0.68);
          }
          mTrace[row] = sampleEcgPeak(mBeatPhase, nextPhase, amp);
          mBeatPhase = nextPhase % 1;
        }
        mSweepRow = nextSweep % mRows;
      }

      const headRow = Math.floor(mSweepRow) % mRows;
      const headY = Math.min(height, headRow * stepPx);
      const headX = spineX + mTrace[headRow];

      if (!reducedMotionQuery.matches) {
        const haloAlpha = isDark
          ? 0.08 + beatGlow * 0.07 + audioLevel * 0.04
          : 0.045 + beatGlow * 0.045 + audioLevel * 0.03;
        drawRadialPool(
          headX,
          headY,
          120 + beatGlow * 28,
          isDark
            ? `rgba(255,77,0,${haloAlpha.toFixed(3)})`
            : `rgba(230,62,0,${haloAlpha.toFixed(3)})`,
          isDark ? "rgba(255,95,25,0.02)" : "rgba(230,130,75,0.015)",
        );
        drawPaperReveal(
          headX,
          headY,
          95,
          0.55,
          0,
          0,
          getPaperPattern(isDark),
        );
      }

      ctx.strokeStyle = isDark
        ? "rgba(255,255,255,0.08)"
        : "rgba(10,10,10,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(spineX, 0);
      ctx.lineTo(spineX, height);
      ctx.stroke();

      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (reducedMotionQuery.matches) {
        ctx.beginPath();
        for (let r = 0; r < mRows; r++) {
          const py = Math.min(height, r * stepPx);
          const px = spineX + mTrace[r];
          if (r === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.35;
        ctx.stroke();
        return;
      }

      const eraseRows = Math.min(mRows - 4, Math.round(36 / stepPx));
      const visibleRows = mRows - eraseRows;
      const accentRows = Math.min(visibleRows, Math.round(58 / stepPx));
      const bands = 18;

      for (let b = bands - 1; b >= 0; b--) {
        const ageStart = Math.min(
          visibleRows - 1,
          Math.round(((b + 1) / bands) * (visibleRows - 1)),
        );
        const ageEnd = Math.round((b / bands) * (visibleRows - 1));
        if (ageStart <= ageEnd) continue;

        const ageMid = (ageStart + ageEnd) * 0.5;
        const inAccent = ageMid < accentRows;

        ctx.beginPath();
        for (let age = ageStart; age >= ageEnd; age--) {
          const row = (((headRow - age) % mRows) + mRows) % mRows;
          const py = Math.min(height, row * stepPx);
          const px = spineX + mTrace[row];
          if (age === ageStart || row === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }

        if (inAccent) {
          ctx.strokeStyle = accentColor;
          ctx.globalAlpha = 0.98 - (ageMid / Math.max(1, accentRows)) * 0.22;
          ctx.lineWidth = 1.65;
        } else {
          ctx.strokeStyle = audioPlaying ? activeColor : lineColor;
          const tailNorm =
            (ageMid - accentRows) / Math.max(1, visibleRows - accentRows);
          ctx.globalAlpha = 0.9 - tailNorm * 0.72;
          ctx.lineWidth = 1.35;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = isDark ? 8 : 5;
      ctx.beginPath();
      ctx.arc(headX, headY, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
      ctx.restore();
      return;
    }

    // Desktop Horizontal Clinical ECG Monitor + Tactile Wire Physics
    if (cols === 0) prefillDesktopTrace();
    const midY = height * MID_RATIO;
    const maxScroll = getMaxScroll();

    if (!reducedMotionQuery.matches) {
      const prevX = currentX;
      const diff = targetX - currentX;
      currentX += diff * Math.min(1, dtSec * 11.5);
      if (Math.abs(diff) < 0.08) currentX = targetX;
      currentX = Math.max(0, Math.min(maxScroll, currentX));
      scrollVelocity = (currentX - prevX) / Math.max(0.001, dtSec);
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
    } else {
      currentX = targetX;
      scrollVelocity = 0;
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
    }

    syncRailUI();

    const speedNorm = Math.min(1, Math.abs(scrollVelocity) / 1400);
    if (!reducedMotionQuery.matches && dtSec > 0) {
      tapBpmBoost = Math.max(0, tapBpmBoost - dtSec * 14);
      const targetBpm = Math.min(
        142,
        64 + speedNorm * 44 + audioLevel * 22 + tapBpmBoost,
      );
      smoothedBpm += (targetBpm - smoothedBpm) * Math.min(1, dtSec * 4.5);
      extraPulseBoost = Math.max(0, extraPulseBoost - dtSec * 1.4);

      const amp = Math.min(
        getMaxSafeAmp(),
        24 + speedNorm * 6 + audioLevel * 10 + extraPulseBoost * 5,
      );
      const sweepSpeedPx = 170 + speedNorm * 55;
      const colAdvance = (sweepSpeedPx * dtSec) / COL_STEP;
      const prevFloor = Math.floor(sweepCol);
      const nextSweep = sweepCol + colAdvance;
      const steps = Math.min(cols, Math.floor(nextSweep) - prevFloor);
      const dtPerCol = COL_STEP / sweepSpeedPx;
      const dPhase = (smoothedBpm / 60) * dtPerCol;

      for (let s = 1; s <= steps; s++) {
        const col = (prevFloor + s) % cols;
        const nextPhase = beatPhase + dPhase;
        const prevMod = ((beatPhase % 1) + 1) % 1;
        const nextMod = ((nextPhase % 1) + 1) % 1;
        if ((prevMod < 0.251 && nextMod >= 0.251) || nextPhase - beatPhase >= 1) {
          beatGlow = Math.min(1, beatGlow + 0.72 + extraPulseBoost * 0.22);
        }
        trace[col] = sampleEcgPeak(beatPhase, nextPhase, amp);
        beatPhase = nextPhase % 1;
      }
      sweepCol = nextSweep % cols;

      // Step taut 1D spring-damper string physics + subtle magnetic cursor pull
      const stepScale = Math.min(1.6, dtSec * 60);
      if (pointerActive && Math.abs(pointerY - midY) < 64 && width > 0) {
        const normX = Math.max(0, Math.min(1, pointerX / width));
        const centerIdx = normX * (STRING_N - 1);
        const pullTarget = Math.max(-18, Math.min(18, (pointerY - midY) * 0.22));
        for (let i = 0; i < STRING_N; i++) {
          const d = Math.abs(i - centerIdx);
          if (d < 6) {
            const w = Math.exp(-(d * d) / 8);
            vel[i] += (pullTarget - disp[i]) * 0.08 * w * stepScale;
          }
        }
      }
      const k = 0.085;
      const damp = 0.085;
      for (let i = 0; i < STRING_N; i++) {
        const force = -k * disp[i] - damp * vel[i];
        vel[i] += force * stepScale;
        disp[i] = Math.max(-28, Math.min(28, disp[i] + vel[i] * stepScale));
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < STRING_N - 1; i++) {
          const avg = (disp[i - 1] + disp[i + 1]) * 0.5;
          vel[i] += (avg - disp[i]) * 0.18 * stepScale;
        }
      }

      // Advance click/detent ripple rings
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].age += dtSec;
        if (ripples[i].age >= ripples[i].maxAge) {
          ripples.splice(i, 1);
        }
      }
    }

    if (bpmEl) {
      const text = `${Math.round(smoothedBpm)} BPM`;
      if (text !== lastBpmText) {
        bpmEl.textContent = text;
        lastBpmText = text;
      }
    }

    const headCol = Math.floor(sweepCol) % cols;
    const headX = Math.min(width, headCol * COL_STEP);
    const headY =
      midY -
      trace[headCol] +
      (reducedMotionQuery.matches ? 0 : sampleStringDisp(headX));

    // LAYER 0a: Cardiac Ambient Light Field (slow-parallax gallery wash + R-peak breath)
    const bgParallaxX = currentX * 0.16;
    const span = Math.max(width, height);
    drawRadialPool(
      width * 0.26 - bgParallaxX * 0.55,
      height * 0.24,
      span * 0.62,
      isDark ? "rgba(255,115,45,0.055)" : "rgba(218,186,152,0.20)",
      isDark ? "rgba(255,115,45,0.015)" : "rgba(218,186,152,0.06)",
    );
    drawRadialPool(
      width * 0.78 - bgParallaxX * 0.45,
      height * 0.78,
      span * 0.58,
      isDark ? "rgba(90,138,190,0.065)" : "rgba(148,172,192,0.16)",
      isDark ? "rgba(90,138,190,0.018)" : "rgba(148,172,192,0.04)",
    );
    const haloInnerAlpha = isDark
      ? 0.085 + beatGlow * 0.06 + audioLevel * 0.045
      : 0.048 + beatGlow * 0.042 + audioLevel * 0.03;
    drawRadialPool(
      reducedMotionQuery.matches ? width * 0.5 : headX,
      midY,
      span * (0.36 + beatGlow * 0.08 + audioLevel * 0.05),
      isDark
        ? `rgba(255,77,0,${haloInnerAlpha.toFixed(3)})`
        : `rgba(230,62,0,${haloInnerAlpha.toFixed(3)})`,
      isDark ? "rgba(255,95,25,0.025)" : "rgba(230,130,75,0.02)",
    );

    // LAYER 0b: Local-Reveal Embossed ECG Chart Paper (scan head, cursor, click ripples)
    if (!reducedMotionQuery.matches) {
      const pattern = getPaperPattern(isDark);
      const paperOffsetX = currentX * 0.25;
      drawPaperReveal(
        headX,
        headY,
        175 + beatGlow * 30,
        0.68 + beatGlow * 0.24,
        paperOffsetX,
        0,
        pattern,
      );
      if (pointerAlpha > 0.01) {
        drawPaperReveal(
          pointerX,
          pointerY,
          195,
          0.65 * pointerAlpha,
          paperOffsetX,
          0,
          pattern,
        );
      }
      for (const r of ripples) {
        const t = r.age / r.maxAge;
        drawPaperReveal(
          r.x,
          r.y,
          40 + t * 115,
          0.78 * (1 - t),
          paperOffsetX,
          0,
          pattern,
        );
      }
    }

    // LAYER 1: Subtle single horizontal reference baseline
    ctx.strokeStyle = isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(10,10,10,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // LAYER 2: Station stems (aligned to actual DOM block edges) & wire anchors
    const canvasRect = canvas.getBoundingClientRect();
    const fallbackGap = window.innerHeight <= 780 ? 36 : 44;
    stationPositions.forEach((worldSx, idx) => {
      const screenSx = worldSx - currentX;
      if (screenSx < -40 || screenSx > width + 40) return;

      const wireDisp = reducedMotionQuery.matches ? 0 : sampleStringDisp(screenSx);
      const anchorY = midY + wireDisp;
      const aboveEl = aboveEls[idx];
      const belowEl = belowEls[idx];
      const topEdgeY = aboveEl
        ? Math.min(anchorY, aboveEl.getBoundingClientRect().bottom - canvasRect.top)
        : anchorY;
      const bottomEdgeY = belowEl
        ? Math.max(anchorY, belowEl.getBoundingClientRect().top - canvasRect.top)
        : anchorY;

      const isActive = hoveredStation === idx || pinnedStation === idx;
      const sweepDist = (headX - screenSx + width) % width;
      const sweepLit =
        !reducedMotionQuery.matches && sweepDist >= 0 && sweepDist < 36;
      const lit = isActive || sweepLit;

      ctx.beginPath();
      ctx.moveTo(
        screenSx,
        aboveEl ? Math.min(topEdgeY, midY - fallbackGap * 0.2) : anchorY,
      );
      ctx.lineTo(
        screenSx,
        belowEl ? Math.max(bottomEdgeY, midY + fallbackGap * 0.2) : anchorY,
      );
      ctx.strokeStyle = isActive ? accentColor : stemColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isActive) {
        ctx.beginPath();
        ctx.arc(screenSx, anchorY, 8, 0, Math.PI * 2);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(screenSx, anchorY, isActive ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = lit ? accentColor : activeColor;
      ctx.stroke();
    });

    // LAYER 3: Phosphor-decay clinical ECG trace (with live string displacement)
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (reducedMotionQuery.matches) {
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const sx = Math.min(width, c * COL_STEP);
        const sy = midY - trace[c];
        if (c === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.45;
      ctx.stroke();
      return;
    }

    const eraseCols = Math.min(cols - 4, Math.round(44 / COL_STEP));
    const visibleCols = cols - eraseCols;
    const accentCols = Math.min(visibleCols, Math.round(75 / COL_STEP));
    const bands = 24;
    const baseInk = audioPlaying || speedNorm > 0.05 ? activeColor : lineColor;

    for (let b = bands - 1; b >= 0; b--) {
      const ageStart = Math.min(
        visibleCols - 1,
        Math.round(((b + 1) / bands) * (visibleCols - 1)),
      );
      const ageEnd = Math.round((b / bands) * (visibleCols - 1));
      if (ageStart <= ageEnd) continue;

      const ageMid = (ageStart + ageEnd) * 0.5;
      const inAccent = ageMid < accentCols;

      ctx.beginPath();
      for (let age = ageStart; age >= ageEnd; age--) {
        const col = (((headCol - age) % cols) + cols) % cols;
        const sx = Math.min(width, col * COL_STEP);
        const sy = midY - trace[col] + sampleStringDisp(sx);
        if (age === ageStart || col === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }

      if (inAccent) {
        ctx.strokeStyle = accentColor;
        ctx.globalAlpha = 0.98 - (ageMid / Math.max(1, accentCols)) * 0.22;
        ctx.lineWidth = 1.75;
      } else {
        ctx.strokeStyle = baseInk;
        const tailNorm =
          (ageMid - accentCols) / Math.max(1, visibleCols - accentCols);
        ctx.globalAlpha = 0.92 - tailNorm * 0.76;
        ctx.lineWidth = 1.45;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Expanding ripple rings from click / hover detents
    for (const r of ripples) {
      const t = r.age / r.maxAge;
      const radius = 4 + t * 34;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = accentColor;
      ctx.globalAlpha = 0.65 * (1 - t) * (1 - t);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Glowing scan-head dot
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = isDark ? 10 : 6;
    ctx.beginPath();
    ctx.arc(headX, headY, 3, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.restore();

    // Live magnetic cursor probe bead along baseline
    if (pointerActive && Math.abs(pointerY - midY) < 64) {
      const pCol = Math.max(0, Math.min(cols - 1, Math.round(pointerX / COL_STEP)));
      const lineY = midY - trace[pCol] + sampleStringDisp(pointerX);
      ctx.strokeStyle = accentColor;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pointerX, lineY - 10);
      ctx.lineTo(pointerX, lineY + 10);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(pointerX, lineY, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }
  }

  const loop = (now: number) => {
    if (signal.aborted) return;
    if (reducedMotionQuery.matches || document.hidden) {
      rafId = 0;
      return;
    }
    const dtSec = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    drawFrame(dtSec);
    rafId = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (reducedMotionQuery.matches || document.hidden) {
      drawFrame(0);
      return;
    }
    if (!rafId) {
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    }
  };

  const stopLoop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const ro = new ResizeObserver(resize);
  ro.observe(viewport);
  ro.observe(canvas);

  const themeObserver = new MutationObserver(() => {
    if (reducedMotionQuery.matches) drawFrame(0);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) stopLoop();
      else startLoop();
    },
    { signal },
  );
  reducedMotionQuery.addEventListener(
    "change",
    () => {
      if (reducedMotionQuery.matches) {
        stopLoop();
        prefillDesktopTrace();
        prefillMobileTrace();
        drawFrame(0);
      } else {
        startLoop();
      }
    },
    { signal },
  );

  cleanup(() => {
    stopLoop();
    ro.disconnect();
    themeObserver.disconnect();
  });

  resize();
  startLoop();
});
