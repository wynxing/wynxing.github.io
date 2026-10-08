export interface Track {
  id: string;
  title: string;
  artist: string;
  src: string;
  cover?: string;
}

// Local files live in public/music/. Sources and licenses: MUSIC.md.
// Test tones are never added here; tests/serve_audio_fixture.py injects those.
export const playlist: Track[] = [
  {
    id: "first-light-particles",
    title: "First Light Particles",
    artist: "Yoiyami",
    src: "/music/first-light-particles.mp3",
  },
  {
    id: "chill-lofi",
    title: "Chill Lofi",
    artist: "omfgdude",
    src: "/music/chill-lofi.mp3",
  },
  {
    id: "vaporware",
    title: "Vaporware",
    artist: "The Cynic Project",
    src: "/music/vaporware.mp3",
  },
  {
    id: "lofi-again",
    title: "Lofi Again",
    artist: "omfgdude",
    src: "/music/lofi-again.mp3",
  },
  {
    id: "yoiyami-core-theme",
    title: "Yoiyami Core Theme",
    artist: "Yoiyami",
    src: "/music/yoiyami-core-theme.mp3",
  },
  {
    id: "calm-track",
    title: "Calm Track",
    artist: "pmiller",
    src: "/music/calm-track.mp3",
  },
];
