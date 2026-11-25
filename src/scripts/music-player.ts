import type { Track } from "../data/music";

const player = document.querySelector<HTMLElement>("[data-music-player]")!;
const audio = player.querySelector<HTMLAudioElement>("[data-audio]")!;
const tracks: Track[] = JSON.parse(player.dataset.playlist || "[]");
let index = 0;
let request = 0;
let failed = false;
let loading = false;
const get = <T extends HTMLElement>(name: string) =>
  player.querySelector<T>(`[data-${name}]`)!;
const play = get<HTMLButtonElement>("play");
const seek = get<HTMLInputElement>("seek");
const volume = get<HTMLInputElement>("volume");
const error = get<HTMLParagraphElement>("music-error");
const formatTime = (value: number) =>
  Number.isFinite(value) && value >= 0
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`
    : "0:00";
const report = (message: string) => {
  error.hidden = !message;
  error.textContent = message;
};

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let timeData: Uint8Array<ArrayBuffer> | null = null;
let eqRaf = 0;

function ensureWebAudio() {
  if (
    typeof window === "undefined" ||
    typeof HTMLMediaElement === "undefined" ||
    !(audio instanceof HTMLMediaElement)
  ) {
    return;
  }
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
      const source = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.fftSize);
    } catch {
      audioCtx = null;
      analyser = null;
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }
}

function getLevel(): number {
  if (audio.paused) return 0;
  if (!analyser || !timeData) return 0.32;
  analyser.getByteTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const sample = (timeData[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / timeData.length) * 3.4);
}

function getBins(): Uint8Array<ArrayBuffer> | null {
  if (audio.paused || !analyser || !freqData) return null;
  analyser.getByteFrequencyData(freqData);
  return freqData;
}

if (typeof window !== "undefined") {
  (
    window as unknown as {
      __pulseAudio?: {
        isPlaying: () => boolean;
        getLevel: () => number;
        getBins: () => Uint8Array<ArrayBuffer> | null;
      };
    }
  ).__pulseAudio = {
    isPlaying: () => !audio.paused,
    getLevel,
    getBins,
  };
}

function updateEqBars(now = 0) {
  if (typeof player.querySelectorAll !== "function") return;
  const bars = player.querySelectorAll<HTMLElement>("[data-eq-bar]");
  if (!bars.length) return;
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (audio.paused || reduced || (typeof document !== "undefined" && document.hidden)) {
    bars.forEach((bar) => {
      bar.style.transform = "scaleY(0.24)";
    });
    eqRaf = 0;
    return;
  }
  const bins = getBins();
  bars.forEach((bar, i) => {
    let val = 0.28 + 0.45 * Math.abs(Math.sin(now * 0.005 + i * 1.1));
    if (bins) {
      const binVal = bins[Math.min(bins.length - 1, 2 + i * 5)] / 255;
      if (binVal > 0.02) val = 0.22 + binVal * 0.78;
    }
    bar.style.transform = `scaleY(${val.toFixed(2)})`;
  });
  if (typeof requestAnimationFrame === "function") {
    eqRaf = requestAnimationFrame(updateEqBars);
  }
}

function render() {
  const active = tracks[index];
  play.disabled = !active;
  play.setAttribute(
    "aria-label",
    failed ? "重试播放" : audio.paused ? "播放" : "暂停",
  );
  play.dataset.playing = String(!audio.paused);
  if (typeof document !== "undefined" && document.documentElement?.dataset) {
    document.documentElement.dataset.musicPlaying = String(!audio.paused);
  }
  const idxEl = get("track-index");
  if (idxEl) {
    idxEl.textContent = tracks.length
      ? `${String(index + 1).padStart(2, "0")}/${String(tracks.length).padStart(2, "0")}`
      : "00/00";
  }
  get("pause").hidden = audio.paused;
  seek.disabled =
    !active ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0 ||
    failed;
  volume.disabled = !active;
  seek.max = String(Number.isFinite(audio.duration) ? audio.duration : 0);
  seek.value = String(audio.currentTime || 0);
  get("elapsed").textContent = formatTime(audio.currentTime);
  get("duration").textContent = formatTime(audio.duration);
  get("music-note").textContent = loading
    ? "正在加载…"
    : !active
      ? "此刻歌单"
      : audio.paused
        ? "SIGNAL READY"
        : "ON AIR";
  get<HTMLButtonElement>("prev").disabled = tracks.length < 2;
  get<HTMLButtonElement>("next").disabled = tracks.length < 2;

  if (!audio.paused && !eqRaf && typeof requestAnimationFrame === "function") {
    eqRaf = requestAnimationFrame(updateEqBars);
  } else if (audio.paused && eqRaf && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(eqRaf);
    eqRaf = 0;
    updateEqBars();
  }
}

function selectTrack(next: number) {
  if (!tracks.length) return;
  request++;
  audio.pause();
  index = (next + tracks.length) % tracks.length;
  failed = false;
  loading = false;
  report("");
  const track = tracks[index];
  audio.src = track.src;
  get("track-title").textContent = track.title;
  get("track-artist").textContent = track.artist;
  const cover = get<HTMLImageElement>("cover");
  cover.hidden = !track.cover;
  if (track.cover) cover.src = track.cover;
  else cover.removeAttribute("src");
  render();
}

async function start() {
  if (!tracks.length) return;
  const currentRequest = ++request;
  failed = false;
  loading = true;
  report("");
  ensureWebAudio();
  if (audio.error) audio.load();
  render();
  try {
    await audio.play();
  } catch (reason) {
    if (currentRequest !== request) return;
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    failed = true;
    report("这首歌暂时无法播放，点击播放按钮重试。");
  } finally {
    if (currentRequest === request) {
      loading = false;
      render();
    }
  }
}

play.addEventListener("click", () => {
  if (!audio.paused || loading) {
    request++;
    loading = false;
    audio.pause();
    render();
  } else void start();
});
for (const [name, step] of [
  ["prev", -1],
  ["next", 1],
] as const) {
  get(name).addEventListener("click", () => {
    const resume = !audio.paused || loading;
    selectTrack(index + step);
    if (resume) void start();
  });
}
seek.addEventListener("input", () => {
  if (!seek.disabled) audio.currentTime = Number(seek.value);
});
volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});
get<HTMLImageElement>("cover").addEventListener("error", () => {
  get("cover").hidden = true;
});
get("expand").addEventListener("click", () => {
  const expanded = player.classList.toggle("is-expanded");
  get("expand").setAttribute("aria-expanded", String(expanded));
  get("expand").setAttribute(
    "aria-label",
    expanded ? "收起播放器" : "展开播放器",
  );
});
for (const event of [
  "play",
  "pause",
  "timeupdate",
  "loadedmetadata",
  "durationchange",
  "volumechange",
])
  audio.addEventListener(event, render);
audio.addEventListener("waiting", () => {
  loading = true;
  render();
});
audio.addEventListener("playing", () => {
  loading = false;
  render();
});
audio.addEventListener("error", () => {
  failed = true;
  loading = false;
  report("音频加载失败，点击播放按钮重试。");
  render();
});
audio.addEventListener("ended", () => {
  if (tracks.length > 1) {
    selectTrack(index + 1);
    void start();
  } else render();
});
audio.volume = 0.7;
if (tracks.length) selectTrack(0);
else render();

// Keep the same audio element through Astro swaps; only move its surface.
function placePlayer() {
  const slot = document.getElementById("home-music-slot");
  const target = slot || document.getElementById("music-home");
  if (target && player.parentElement !== target) target.append(player);
  player.classList.toggle("is-mini", !slot);
  render();
}
document.addEventListener("astro:page-load", placePlayer);
placePlayer();
