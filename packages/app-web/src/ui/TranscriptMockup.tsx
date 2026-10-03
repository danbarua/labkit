import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Recording } from "./playback";
import { Page, Replay } from "./Replay";
import { transcriptRecording } from "./transcripts-api";

type Loaded = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; message: string };

/**
 * One recorded session from `@labkit/acp-transcripts`, full screen, drawn as a person using the
 * agent sees it: composer included, connected to nothing. Fetched fresh on every load, so a
 * hand-edited transcript shows on reload.
 */
export default function TranscriptMockup({ slug }: { slug: string }) {
  const [loaded, setLoaded] = useState<Recording | Loaded>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ kind: "loading" });
    transcriptRecording(slug, controller.signal).then(
      (recording) => {
        if (!controller.signal.aborted) setLoaded(recording ?? { kind: "missing" });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => controller.abort();
  }, [slug]);

  if (!("kind" in loaded)) return <Replay key={slug} crumb={slug} recording={loaded} />;
  return (
    <Page crumb={slug} controls={null}>
      <div className="page">
        {loaded.kind === "loading" ? null : loaded.kind === "missing" ? (
          <p>
            No transcript named <code>{slug}</code>. <Link to="/gallery">Back to the gallery</Link>
          </p>
        ) : (
          <p>{loaded.message}</p>
        )}
      </div>
    </Page>
  );
}
