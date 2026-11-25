import { onPage } from "./lifecycle";

interface PulseAudioBridge {
  isPlaying: () => boolean;
  getLevel: () => number;
  getBins: () => Uint8Array | null;
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
  const stageWidth = 2520;
  const stationPositions = stationEls.map((el) =>
    Number(el.dataset.stationX || 0),
  );
  const stationDirs = stationEls.map((el) =>
    el.classList.contains("is-above") ? -1 : 1,
  );
  const hasAbove = stationEls.map(
    (el, idx) =>
      el.classList.contains("is-above") ||
      mirrorEls.some(
        (m) =>
          Number(m.dataset.pulseMirror) === idx &&
          m.classList.contains("is-above"),
      ),
  );
  const hasBelow = stationEls.map(
    (el, idx) =>
      el.classList.contains("is-below") ||
      mirrorEls.some(
        (m) =>
          Number(m.dataset.pulseMirror) === idx &&
          m.classList.contains("is-below"),
      ),
  );

  // Inertial horizontal scroll state
  let currentX = 0;
  let targetX = 0;
  let scrollVelocity = 0;
  let pinnedStation: number | null = null;
  let hoveredStation: number | null = null;
  const stationBoost = stationEls.map(() => 0);

  // 1D spring-damper string physics across viewport width
  const STRING_N = 160;
  const disp = new Float32Array(STRING_N);
  const vel = new Float32Array(STRING_N);

  // Pointer telemetry
  let pointerActive = false;
  let pointerX = 0;
  let pointerY = 0;
  let prevPointerY = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastTime = 0;
  let sweepPhase = 0;
  let beatClock = 0;
  let lastBpmText = "";
  let mobileScrollSpeed = 0;
  let lastWindowScrollY = typeof window !== "undefined" ? window.scrollY : 0;

  const getMaxScroll = () => Math.max(0, stageWidth - viewport.clientWidth);

  const injectImpulseAtScreenX = (screenX: number, strength: number) => {
    if (!desktopQuery.matches || reducedMotionQuery.matches || width <= 0) return;
    const normX = Math.max(0, Math.min(1, screenX / width));
    const centerIdx = normX * (STRING_N - 1);
    for (let i = 0; i < STRING_N; i++) {
      const d = Math.abs(i - centerIdx);
      if (d < 9) {
        vel[i] += strength * Math.exp(-(d * d) / 11);
      }
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
      drawFrame(0, 0);
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

  // Cross-line mirror sync: 02 WORKS -> Above Project Inspect Mirror
  const projectMirror = document.querySelector<HTMLElement>("[data-project-mirror]");
  const projectRows = [
    ...document.querySelectorAll<HTMLElement>("[data-project-item]"),
  ];
  if (projectMirror && projectRows.length > 0) {
    const pmIndex = projectMirror.querySelector("[data-pm-index]");
    const pmStack = projectMirror.querySelector("[data-pm-stack]");
    const pmTitle = projectMirror.querySelector("[data-pm-title]");
    const pmRole = projectMirror.querySelector("[data-pm-role]");
    const pmHighlight = projectMirror.querySelector("[data-pm-highlight]");

    const activateProject = (row: HTMLElement, ripple: boolean) => {
      projectRows.forEach((item) => item.classList.toggle("is-active", item === row));
      if (pmIndex) pmIndex.textContent = row.dataset.idx || "";
      if (pmStack) pmStack.textContent = row.dataset.stack || "";
      if (pmTitle) pmTitle.textContent = row.dataset.title || "";
      if (pmRole) pmRole.textContent = row.dataset.role || "";
      if (pmHighlight) pmHighlight.textContent = row.dataset.highlight || "";
      if (ripple) {
        injectImpulseAtScreenX((stationPositions[1] ?? 820) - currentX, -11);
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

  // Cross-line mirror sync: 03 WRITING -> Below Excerpt Mirror
  const postMirror = document.querySelector<HTMLElement>("[data-post-mirror]");
  const postRows = [
    ...document.querySelectorAll<HTMLElement>("[data-post-item]"),
  ];
  if (postMirror && postRows.length > 0) {
    const wmMeta = postMirror.querySelector("[data-wm-meta]");
    const wmTitle = postMirror.querySelector("[data-wm-title]");
    const wmDesc = postMirror.querySelector("[data-wm-desc]");

    const activatePost = (row: HTMLElement, ripple: boolean) => {
      postRows.forEach((item) => item.classList.toggle("is-active", item === row));
      if (wmMeta) wmMeta.textContent = row.dataset.meta || "";
      if (wmTitle) wmTitle.textContent = row.dataset.title || "";
      if (wmDesc) wmDesc.textContent = row.dataset.desc || "";
      if (ripple) {
        injectImpulseAtScreenX((stationPositions[2] ?? 1380) - currentX, 11);
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

  // Drag-to-pan with throw momentum
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
      pointerActive = true;
      prevPointerY = pointerY || event.clientY - rect.top;
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;

      // Pluck the string physically if cursor moves near midline
      if (desktopQuery.matches && !reducedMotionQuery.matches && width > 0) {
        const midY = height * 0.5;
        const distY = Math.abs(pointerY - midY);
        const dy = pointerY - prevPointerY;
        if (distY < 56 && Math.abs(dy) > 0.6) {
          const impulse = Math.max(-16, Math.min(16, dy * 0.85));
          injectImpulseAtScreenX(pointerX, impulse * 0.45);
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

  // Tactile click pluck near baseline
  viewport.addEventListener(
    "click",
    (event) => {
      if (!desktopQuery.matches || reducedMotionQuery.matches) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, input, select, label")) return;
      const rect = viewport.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      if (Math.abs(clickY - height * 0.5) < 90 && width > 0) {
        injectImpulseAtScreenX(clickX, -18);
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
    } else {
      const maxScroll = getMaxScroll();
      targetX = Math.max(0, Math.min(maxScroll, targetX));
      currentX = Math.max(0, Math.min(maxScroll, currentX));
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
    }
    syncRailUI();
    drawFrame(typeof performance !== "undefined" ? performance.now() : 0, 0);
  };

  // Sharp ECG kernel centered around normalized dx (in world px)
  const ecgSample = (dx: number, dir: number, amp: number) => {
    const adx = Math.abs(dx);
    if (adx > 96) return 0;
    const p = Math.exp(-((dx + 48) * (dx + 48)) / 90) * 5;
    const q = -Math.exp(-((dx + 14) * (dx + 14)) / 24) * 7;
    const r = Math.exp(-(dx * dx) / 36) * amp;
    const s = -Math.exp(-((dx - 13) * (dx - 13)) / 26) * 11;
    const t = Math.exp(-((dx - 48) * (dx - 48)) / 140) * 8;
    return dir * (p + q + r + s + t);
  };

  function drawFrame(now: number, dtSec: number) {
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
    const audioBins = audioPlaying ? bridge?.getBins() || null : null;

    ctx.clearRect(0, 0, width, height);

    if (!desktopQuery.matches) {
      // Mobile: live vertical heartbeat trace along left spine (x = 20)
      const spineX = 20;
      const steps = Math.max(80, Math.floor(height / 4));
      mobileScrollSpeed *= 0.9;
      const energy = audioLevel * 14 + mobileScrollSpeed * 0.45;
      beatClock += dtSec * (1.06 + energy * 0.04);

      // Vertical tick ruler
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(10,10,10,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y <= height; y += 24) {
        const len = y % 120 === 0 ? 7 : 3;
        ctx.moveTo(spineX - len, y);
        ctx.lineTo(spineX, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const y = (i / steps) * height;
        let xOff = 0;
        if (!reducedMotionQuery.matches) {
          const cycle = ((y / 170 - beatClock * 0.7) % 1 + 1) % 1;
          if (cycle > 0.35 && cycle < 0.65) {
            const local = (cycle - 0.5) * 260;
            xOff += ecgSample(local, 1, 13 + energy * 0.6);
          }
          if (audioPlaying) {
            xOff += Math.sin(y * 0.06 + now * 0.008) * (2.5 + audioLevel * 8);
          }
        }
        const px = spineX + xOff;
        if (i === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.strokeStyle = audioPlaying ? activeColor : lineColor;
      ctx.lineWidth = 1.35;
      ctx.stroke();

      if (!reducedMotionQuery.matches) {
        const dotY = ((beatClock * 110) % height + height) % height;
        ctx.beginPath();
        ctx.arc(spineX, dotY, 3, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
      }
      return;
    }

    // Desktop Horizontal Physics Wave
    const midY = height * 0.5;
    const maxScroll = getMaxScroll();

    if (!reducedMotionQuery.matches) {
      const prevX = currentX;
      const diff = targetX - currentX;
      currentX += diff * Math.min(1, dtSec * 11.5);
      if (Math.abs(diff) < 0.08) currentX = targetX;
      currentX = Math.max(0, Math.min(maxScroll, currentX));
      scrollVelocity = (currentX - prevX) / Math.max(0.001, dtSec);
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;

      stationEls.forEach((_el, idx) => {
        const targetBoost = hoveredStation === idx ? 1 : 0;
        stationBoost[idx] += (targetBoost - stationBoost[idx]) * Math.min(1, dtSec * 10);
      });
    } else {
      currentX = targetX;
      scrollVelocity = 0;
      stage.style.transform = `translate3d(${-currentX.toFixed(2)}px, 0, 0)`;
    }

    syncRailUI();

    const speedNorm = Math.min(1, Math.abs(scrollVelocity) / 1400);
    const liveBpm = Math.round(64 + speedNorm * 58 + audioLevel * 28);
    if (bpmEl) {
      const text = `${liveBpm} BPM`;
      if (text !== lastBpmText) {
        bpmEl.textContent = text;
        lastBpmText = text;
      }
    }

    // Step 1D spring-damper string physics
    if (!reducedMotionQuery.matches) {
      const k = 0.06;
      const damp = 0.095;
      for (let i = 0; i < STRING_N; i++) {
        const force = -k * disp[i] - damp * vel[i];
        vel[i] += force;
        disp[i] += vel[i];
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < STRING_N - 1; i++) {
          const avg = (disp[i - 1] + disp[i + 1]) * 0.5;
          vel[i] += (avg - disp[i]) * 0.14;
        }
      }
      beatClock += dtSec * (liveBpm / 60);
      sweepPhase = (sweepPhase + dtSec * (0.22 + speedNorm * 0.25)) % 1;
    }

    // LAYER 1: Slow-Parallax Oscilloscope Coordinate Grid & Giant Faint Watermarks
    const parallaxX = currentX * 0.35;
    const gridSpacing = 180;
    const firstGrid = Math.floor(parallaxX / gridSpacing) * gridSpacing;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.032)" : "rgba(10,10,10,0.042)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = firstGrid; gx <= parallaxX + width + gridSpacing; gx += gridSpacing) {
      const sx = gx - parallaxX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    ctx.stroke();

    // Precision crosshairs (+) at coordinate intersections
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.09)" : "rgba(10,10,10,0.10)";
    ctx.beginPath();
    for (let gx = firstGrid; gx <= parallaxX + width + gridSpacing; gx += gridSpacing) {
      const sx = gx - parallaxX;
      for (const cy of [midY - 125, midY + 125]) {
        ctx.moveTo(sx - 4, cy);
        ctx.lineTo(sx + 4, cy);
        ctx.moveTo(sx, cy - 4);
        ctx.lineTo(sx, cy + 4);
      }
    }
    ctx.stroke();

    // Fine centerline oscilloscope ruler ticks
    const tickSpacing = 24;
    const firstTick = Math.floor(currentX / tickSpacing) * tickSpacing;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(10,10,10,0.085)";
    ctx.beginPath();
    for (let tx = firstTick; tx <= currentX + width + tickSpacing; tx += tickSpacing) {
      const sx = tx - currentX;
      const major = tx % 120 === 0;
      const len = major ? 7 : 3;
      ctx.moveTo(sx, midY - len);
      ctx.lineTo(sx, midY + len);
    }
    ctx.stroke();

    const sampleY = (screenX: number) => {
      const worldX = screenX + currentX;
      let y = midY;

      // Station ECG anchor waves
      const baseAmp = 21 + speedNorm * 10 + audioLevel * 8;
      for (let i = 0; i < stationPositions.length; i++) {
        const sx = stationPositions[i];
        const boost = stationBoost[i] * 11;
        y += ecgSample(worldX - sx, stationDirs[i], baseAmp + boost);
      }

      if (!reducedMotionQuery.matches) {
        // Traveling resting heartbeat ripple
        const pulseScreenX = sweepPhase * width;
        const dPulse = screenX - pulseScreenX;
        if (Math.abs(dPulse) < 64) {
          y +=
            Math.sin((dPulse / 64) * Math.PI) *
            Math.exp(-(dPulse * dPulse) / 500) *
            (7 + audioLevel * 10);
        }

        // Live Web Audio harmonic spectrum
        if (audioPlaying) {
          const norm = screenX / Math.max(1, width);
          let binEnergy = audioLevel;
          if (audioBins && audioBins.length > 0) {
            const binIdx = Math.min(
              audioBins.length - 1,
              Math.floor(norm * (audioBins.length * 0.55)),
            );
            binEnergy = Math.max(audioLevel * 0.5, audioBins[binIdx] / 255);
          }
          y +=
            Math.sin(screenX * 0.028 - now * 0.0065) * (3 + binEnergy * 18) +
            Math.cos(screenX * 0.055 + now * 0.004) * (1.5 + binEnergy * 9);
        }

        // Cursor spring displacement
        const idxFloat = (screenX / Math.max(1, width)) * (STRING_N - 1);
        const i0 = Math.max(0, Math.min(STRING_N - 2, Math.floor(idxFloat)));
        const frac = idxFloat - i0;
        y += disp[i0] * (1 - frac) + disp[i0 + 1] * frac;
      }

      return y;
    };

    // Precompute primary trace Y samples across viewport width
    const stepPx = 3;
    const cols = Math.ceil(width / stepPx) + 1;
    const ys = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      ys[c] = sampleY(Math.min(width, c * stepPx));
    }

    const headX = sweepPhase * width;

    // LAYER 2: Subtle vertical modulation / spectrum hairlines from midY to wave envelope
    ctx.lineWidth = 1;
    for (let c = 0; c < cols; c += 4) {
      const sx = Math.min(width, c * stepPx);
      const dy = ys[c] - midY;
      if (Math.abs(dy) < 1.5) continue;
      const nearHead = !reducedMotionQuery.matches && sx <= headX && sx >= headX - 95;
      ctx.strokeStyle = nearHead
        ? isDark
          ? "rgba(255,77,0,0.25)"
          : "rgba(230,62,0,0.20)"
        : isDark
          ? "rgba(255,255,255,0.11)"
          : "rgba(10,10,10,0.10)";
      ctx.beginPath();
      ctx.moveTo(sx, midY);
      ctx.lineTo(sx, ys[c]);
      ctx.stroke();
    }

    // LAYER 3: 2 Phase-lagged Ghost Echo Traces for analog depth
    const echoes = [
      { lagCols: 5, scale: 0.36, alphaDark: 0.09, alphaLight: 0.1 },
      { lagCols: 2, scale: 0.64, alphaDark: 0.19, alphaLight: 0.18 },
    ];
    for (const echo of echoes) {
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const sx = Math.min(width, c * stepPx);
        const srcIdx = Math.max(0, c - echo.lagCols);
        const ey = midY + (ys[srcIdx] - midY) * echo.scale;
        if (c === 0) ctx.moveTo(sx, ey);
        else ctx.lineTo(sx, ey);
      }
      ctx.strokeStyle = isDark
        ? `rgba(244,244,242,${echo.alphaDark})`
        : `rgba(10,10,10,${echo.alphaLight})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // LAYER 4: Primary Live Heartbeat Trace
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const sx = Math.min(width, c * stepPx);
      if (c === 0) ctx.moveTo(sx, ys[c]);
      else ctx.lineTo(sx, ys[c]);
    }
    ctx.strokeStyle = audioPlaying || speedNorm > 0.05 ? activeColor : lineColor;
    ctx.lineWidth = 1.45;
    ctx.stroke();

    // Signal Orange sweep segment + phosphor head dot
    if (!reducedMotionQuery.matches) {
      const headStart = Math.max(0, headX - 95);
      const startCol = Math.max(0, Math.floor(headStart / stepPx));
      const endCol = Math.min(cols - 1, Math.ceil(headX / stepPx));
      ctx.beginPath();
      for (let c = startCol; c <= endCol; c++) {
        const sx = Math.min(width, c * stepPx);
        if (c === startCol) ctx.moveTo(sx, ys[c]);
        else ctx.lineTo(sx, ys[c]);
      }
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const headY = sampleY(headX);
      ctx.save();
      if (isDark) {
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.arc(headX, headY, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
      ctx.restore();
    }

    // Dynamic stems connecting existing above/below blocks to exact wave anchor
    const stemEdgeOffset = window.innerHeight <= 750 ? 38 : 52;
    stationPositions.forEach((worldSx, idx) => {
      const screenSx = worldSx - currentX;
      if (screenSx < -40 || screenSx > width + 40) return;
      const anchorY = sampleY(screenSx);
      const topEdgeY = hasAbove[idx] ? midY - stemEdgeOffset : anchorY;
      const bottomEdgeY = hasBelow[idx] ? midY + stemEdgeOffset : anchorY;
      const isActive = hoveredStation === idx || pinnedStation === idx;

      ctx.beginPath();
      ctx.moveTo(screenSx, topEdgeY);
      ctx.lineTo(screenSx, bottomEdgeY);
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
      ctx.strokeStyle = isActive ? accentColor : activeColor;
      ctx.stroke();
    });

    if (pointerActive && !reducedMotionQuery.matches && Math.abs(pointerY - midY) < 70) {
      const lineY = sampleY(pointerX);
      ctx.beginPath();
      ctx.arc(pointerX, lineY, 2.5, 0, Math.PI * 2);
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
    drawFrame(now, dtSec);
    rafId = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (reducedMotionQuery.matches || document.hidden) {
      drawFrame(0, 0);
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
    if (reducedMotionQuery.matches) drawFrame(0, 0);
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
        drawFrame(0, 0);
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
