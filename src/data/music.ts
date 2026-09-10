export interface Track {
  id: string;
  title: string;
  artist: string;
  src: string;
  cover?: string;
}

// Add your own local /music/... files or stable HTTPS audio URLs here.
// Empty by design: test audio is never shipped as a real playlist.
export const playlist: Track[] = [];
