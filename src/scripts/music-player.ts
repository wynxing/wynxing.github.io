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

function render() {
  const active = tracks[index];
  play.disabled = !active;
  play.setAttribute(
    "aria-label",
    failed ? "重试播放" : audio.paused ? "播放" : "暂停",
  );
  play.dataset.playing = String(!audio.paused);
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
      ? "你的夏日歌单"
      : audio.paused
        ? "按下播放，慢慢听。"
        : "正在播放";
  get<HTMLButtonElement>("prev").disabled = tracks.length < 2;
  get<HTMLButtonElement>("next").disabled = tracks.length < 2;
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
