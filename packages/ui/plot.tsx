import { useEffect, useRef, useState } from "react";

/** The media types a Vega-Lite spec travels under: `application/vnd.vegalite.v5+json` and later. */
export const isVegaLite = (mimeType: string | null | undefined): boolean =>
  mimeType != null && /^application\/vnd\.vegalite\.v\d+\+json$/.test(mimeType);

/**
 * A chart from a Vega-Lite spec: the model supplies the data and a declarative description, and
 * the layout (scales, axes, legend, colours) is settled here, once. The chart library loads only
 * when a chart is drawn. A spec that does not parse or render is shown as its text instead.
 */
export function VegaLitePlot({ spec }: { spec: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | undefined>(undefined);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    let finalize: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const parsed = JSON.parse(spec) as Record<string, unknown>;
        const { default: embed } = await import("vega-embed");
        if (cancelled) return;
        const style = getComputedStyle(el);
        const text = style.color;
        const line = style.getPropertyValue("--lk-line").trim() || "rgba(128,128,128,0.3)";
        const font = style.fontFamily;
        const result = await embed(el, parsed as never, {
          actions: false,
          renderer: "svg",
          config: {
            background: "transparent",
            font,
            view: { stroke: "transparent" },
            axis: {
              labelColor: text,
              titleColor: text,
              gridColor: line,
              domainColor: line,
              tickColor: line,
            },
            legend: { labelColor: text, titleColor: text },
            title: { color: text },
          },
        });
        finalize = () => result.finalize();
        if (cancelled) finalize();
      } catch (error) {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
      finalize?.();
    };
  }, [spec]);

  if (failed !== undefined)
    return (
      <div className="lk-plot-failed">
        <div className="lk-caption">The chart could not be drawn: {failed}</div>
        <pre className="lk-pre">{spec}</pre>
      </div>
    );
  return <div ref={host} className="lk-plot" role="img" aria-label="Chart" />;
}
