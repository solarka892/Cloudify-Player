import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  ListPlus,
  Music,
  Pause,
  Play,
  ShoppingBag,
} from "lucide-react";
import {
  scTrackComments,
  scTrackDetail,
  scTrackDownloadUrl,
  scTrackInPlaylists,
  scTrackLikers,
  scTrackReposters,
  scRelatedTracks,
  scWaveform,
  type Comment,
  type Playlist,
  type Track,
  type TrackDetail,
  type User,
  type Waveform as WaveformData,
} from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { PlaylistList } from "@/components/PlaylistList";
import { UserList } from "@/components/UserList";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ShareButton } from "@/components/ShareButton";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import { Waveform } from "./Waveform";
import { Comments } from "./Comments";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";

/** Compact number formatting: 12500 → 12.5K. */
function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** The list projection of a detail object, for the player and the buttons. */
function asTrack(detail: TrackDetail): Track {
  return {
    id: detail.id,
    title: detail.title,
    duration: detail.duration,
    artwork_url: detail.artwork_url,
    permalink_url: detail.permalink_url,
    artist: detail.artist,
  };
}

type Side = "comments" | "related" | "playlists" | "likers" | "reposters";

/**
 * A track page: waveform, timed comments, stats, and everything that hangs off
 * a track on soundcloud.com.
 *
 * The side lists load only when their tab is opened. A track with 40k likers
 * should not pay for that list because someone wanted to read the description.
 */
export function TrackView({ trackId, meId }: { trackId: number; meId: number }) {
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wave, setWave] = useState<WaveformData | null>(null);
  const [side, setSide] = useState<Side>("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [related, setRelated] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likers, setLikers] = useState<User[]>([]);
  const [reposters, setReposters] = useState<User[]>([]);
  const [loadingSide, setLoadingSide] = useState<Side | null>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);

  const back = useNavStore((s) => s.back);
  const openUser = useNavStore((s) => s.openUser);
  const openSearch = useNavStore((s) => s.openSearch);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seek = usePlayerStore((s) => s.seek);
  const isCurrent = usePlayerStore((s) => s.current?.id === trackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const position = usePlayerStore((s) => s.position);
  const startDownload = useDownloadsStore((s) => s.start);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setWave(null);
    setComments([]);
    setRelated([]);
    setPlaylists([]);
    setLikers([]);
    setReposters([]);
    setSide("comments");

    scTrackDetail(trackId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        // The waveform is a second request to a CDN; a failure there costs the
        // bars, not the page, so it never reaches the error state.
        if (d.waveform_url) {
          scWaveform(d.waveform_url)
            .then((w) => !cancelled && setWave(w))
            .catch(() => undefined);
        }
      })
      .catch((e) => !cancelled && setError(String(e)));

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  // Comments load with the page: they are the reason the waveform has markers,
  // so deferring them to a tab click would leave the bar looking empty.
  useEffect(() => {
    let cancelled = false;
    scTrackComments(trackId)
      .then((c) => !cancelled && setComments(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  useEffect(() => {
    let cancelled = false;
    const fetchers: Partial<Record<Side, () => Promise<void>>> = {
      related: async () => {
        const items = await scRelatedTracks(trackId, 30);
        if (!cancelled) setRelated(items);
      },
      playlists: async () => {
        const items = await scTrackInPlaylists(trackId, 50);
        if (!cancelled) setPlaylists(items);
      },
      likers: async () => {
        const items = await scTrackLikers(trackId, 200);
        if (!cancelled) setLikers(items);
      },
      reposters: async () => {
        const items = await scTrackReposters(trackId, 200);
        if (!cancelled) setReposters(items);
      },
    };

    const already =
      (side === "related" && related.length > 0) ||
      (side === "playlists" && playlists.length > 0) ||
      (side === "likers" && likers.length > 0) ||
      (side === "reposters" && reposters.length > 0);

    const fetcher = fetchers[side];
    if (!fetcher || already) return;

    setLoadingSide(side);
    void fetcher()
      .catch(() => undefined)
      .finally(() => !cancelled && setLoadingSide(null));

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the tab and the track only: including the lists
    // would re-run this the moment a fetch lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, trackId]);

  if (error) {
    return (
      <div className="stack">
        <BackButton onClick={back} />
        <p className="text-sm text-destructive">
          {t.trackPage.error}: {error}
        </p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="stack">
        <BackButton onClick={back} />
        <p className="text-sm text-muted-foreground">{t.trackPage.loading}</p>
      </div>
    );
  }

  const track = asTrack(detail);
  const cover = artwork(detail.artwork_url, "t500x500");

  const tabs: { id: Side; label: string; count?: number | null }[] = [
    { id: "comments", label: t.trackPage.comments, count: detail.comment_count },
    { id: "related", label: t.trackPage.related },
    { id: "playlists", label: t.trackPage.inPlaylists },
    { id: "likers", label: t.trackPage.likers, count: detail.likes_count },
    { id: "reposters", label: t.trackPage.reposters, count: detail.reposts_count },
  ];

  return (
    <div className="stack-lg w-full max-w-3xl">
      <BackButton onClick={back} />

      <section className="panel panel-raised relative overflow-hidden rounded-[var(--radius-hero)] p-5">
        {cover && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-20 blur-2xl"
            style={{ backgroundImage: `url("${cover}")` }}
          />
        )}

        <div className="relative flex flex-wrap items-start gap-4">
          {cover ? (
            <img
              src={cover}
              alt=""
              className="h-36 w-36 shrink-0 rounded-[var(--radius)] object-cover shadow-[var(--shadow-2)]"
            />
          ) : (
            <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-[var(--radius)] bg-secondary">
              <Music className="h-10 w-10 text-muted-foreground" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1
              className="text-2xl font-bold leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {detail.title}
            </h1>

            {detail.user && (
              <button
                onClick={() => detail.user && openUser(detail.user)}
                className="w-fit text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-brand"
              >
                {detail.user.username}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {formatCount(detail.playback_count)} {t.trackPage.plays}
              </span>
              <span>
                {formatCount(detail.likes_count)} {t.trackPage.likes}
              </span>
              <span>
                {formatCount(detail.reposts_count)} {t.trackPage.reposts}
              </span>
              {detail.created_at && (
                <span>
                  {t.trackPage.released}{" "}
                  {new Date(detail.created_at).toLocaleDateString()}
                </span>
              )}
              {detail.genre && <span>{detail.genre}</span>}
              {detail.label_name && (
                <span>
                  {t.trackPage.byLabel}: {detail.label_name}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1">
              <button
                onClick={() =>
                  isCurrent ? togglePlay() : void playTrack(track, [track])
                }
                className="brand-gradient mr-1 flex items-center gap-1.5 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90"
              >
                {isCurrent && isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px]" />
                )}
                {isCurrent && isPlaying ? t.player.pause : t.player.play}
              </button>

              <LikeButton track={track} size="md" />
              <RepostButton track={track} size="md" />
              <ShareButton url={detail.permalink_url} />

              <button
                onClick={() => setAddTo(track)}
                title={t.track.addToPlaylist}
                aria-label={t.track.addToPlaylist}
                className="rounded-full p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
              >
                <ListPlus className="h-5 w-5" />
              </button>

              <button
                onClick={() => void startDownload(track)}
                title={t.track.download}
                aria-label={t.track.download}
                className="rounded-full p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
              >
                <Download className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative mt-4">
          <Waveform
            data={wave}
            durationMs={detail.duration}
            positionMs={isCurrent ? position * 1000 : 0}
            comments={comments}
            onSeek={(seconds) => {
              // Seeking a track that isn't loaded has to load it first.
              if (!isCurrent) {
                void playTrack(track, [track]).then(() => seek(seconds));
                return;
              }
              seek(seconds);
            }}
          />
        </div>
      </section>

      {/* The uploader's own links: a purchase page, or the original file. */}
      {(detail.purchase_url || detail.downloadable) && (
        <div className="flex flex-wrap gap-2">
          {detail.purchase_url && (
            <a
              href={detail.purchase_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
            >
              <ShoppingBag className="h-4 w-4" />
              {detail.purchase_title ?? t.trackPage.buy}
            </a>
          )}
          {detail.downloadable && (
            <button
              onClick={() => {
                void scTrackDownloadUrl(detail.id)
                  .then((url) => {
                    window.open(url, "_blank");
                    toast(t.trackPage.downloadStarted, "info");
                  })
                  .catch(() => toast(t.trackPage.downloadFailed, "error"));
              }}
              className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              {t.trackPage.downloadOriginal}
            </button>
          )}
          {detail.permalink_url && (
            <a
              href={detail.permalink_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              {t.trackPage.openOnSc}
            </a>
          )}
        </div>
      )}

      {detail.description && (
        <p className="max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
          {detail.description}
        </p>
      )}

      {detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detail.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => openSearch(tag)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:border-brand hover:text-brand"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <nav className="flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSide(tab.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              side === tab.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="label">{tab.label}</span>
            {tab.count != null && tab.count > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCount(tab.count)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {loadingSide === side && (
        <p className="text-sm text-muted-foreground">{t.trackPage.loading}</p>
      )}

      {side === "comments" && (
        <Comments
          track={track}
          meId={meId}
          comments={comments}
          onChange={setComments}
          onSeek={(seconds) => {
            if (!isCurrent) {
              void playTrack(track, [track]).then(() => seek(seconds));
              return;
            }
            seek(seconds);
          }}
        />
      )}

      {side === "related" && related.length > 0 && <TrackList tracks={related} />}
      {side === "playlists" && playlists.length > 0 && (
        <PlaylistList playlists={playlists} />
      )}
      {side === "likers" && likers.length > 0 && <UserList users={likers} />}
      {side === "reposters" && reposters.length > 0 && (
        <UserList users={reposters} />
      )}

      {addTo && (
        <AddToPlaylistDialog track={addTo} onClose={() => setAddTo(null)} />
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={t.nav.back}
      className="flex w-fit items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t.nav.back}
    </button>
  );
}
