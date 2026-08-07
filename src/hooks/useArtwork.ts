import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { artwork, type ArtSize } from "@/lib/utils";

/**
 * A track's cover, from disk when the track has been downloaded.
 *
 * A downloaded track carries its cover beside its audio (saved during the
 * download from bytes that were being fetched for the ID3 tag anyway), so there
 * is no reason to ask the CDN for it again — and covers, not audio, are what a
 * list view actually spends its bandwidth on: one request per visible row,
 * every time the list is opened. For an offline library the count should be
 * zero.
 *
 * Subscribed to `covers` rather than to `items`, so a download reporting
 * progress does not re-render every row in the app; see the store.
 *
 * The size is only meaningful for the remote URL. The local copy is a single
 * 500px file — resizing it would mean writing four, and the browser scales it
 * down for free.
 */
export function useArtwork(
  track: { id: number; artwork_url: string | null } | null,
  size: ArtSize = "t120x120",
): string | null {
  const covers = useDownloadsStore((s) => s.covers);
  if (!track) return null;
  return covers[track.id] ?? artwork(track.artwork_url, size);
}
