import { Link } from "@tanstack/react-router";
import { useLoaded } from "./loaded";
import { Page, Replay } from "./Replay";
import { transcriptRecording } from "./transcripts-api";

/**
 * One recorded session from `@labkit/acp-transcripts`, full screen, drawn as a person using the
 * agent sees it: composer included, connected to nothing. Fetched fresh on every load, so a
 * hand-edited transcript shows on reload.
 */
export default function TranscriptMockup({ slug }: { slug: string }) {
  const loaded = useLoaded((signal) => transcriptRecording(slug, signal), slug);
  if (loaded.kind === "loaded" && loaded.value !== undefined)
    return <Replay key={slug} crumb={slug} recording={loaded.value} />;
  return (
    <Page crumb={slug} controls={null}>
      <div className="page">
        {loaded.kind === "loading" ? null : loaded.kind === "failed" ? (
          <p>{loaded.message}</p>
        ) : (
          <p>
            No transcript named <code>{slug}</code>. <Link to="/gallery">Back to the gallery</Link>
          </p>
        )}
      </div>
    </Page>
  );
}
