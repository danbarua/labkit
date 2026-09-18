import type { Runtime } from "./runtime";

// matches /graph/Q_1
const MATCHER = new URLPattern({ pathname: "/graph/:id" });

export async function graphHandler(req: Request, runtime: Runtime): Promise<Response> {
    if (!URL.canParse(req.url)){
        throw Error('Invalid URL');
    }
    
    const m = MATCHER.exec(req.url);
    const id = m?.pathname.groups.id;
    if (!id) {
        return new Response("Not Found", { status: 404 });
    }

    const url = new URL(req.url);
    const depthParam = url.searchParams.get("depth");
    const depth = Number.parseInt(depthParam || "0");

    const queryResult = await runtime.connection.db.query("SELECT entity_as_hal($1, $2)", [id, depth]);
    if (!queryResult || !queryResult.rows.length) {
        return new Response("Not Found", { status: 404 });
    }

    const resource = queryResult!.rows.at(0)!.entity_as_hal as Record<string, unknown>;
        const converted = convertLinksToAbsolute(resource, url);

    return new Response(JSON.stringify(converted), {
        status: 200,
        headers: { "content-type": "application/hal+json" },
    });
}

// walk through the resource and convert _links to absolute URLs
function convertLinksToAbsolute(obj: any, baseUrl: URL): Record<string, unknown> {
    if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj)) {
            if (key === "_links" && typeof obj[key] === "object") {
                for (const linkKey of Object.keys(obj[key])) {
                    const linkValue = obj[key][linkKey];
                    if (Array.isArray(linkValue)) {
                        obj[key][linkKey] = linkValue.map((link: any) => {
                            if (link && typeof link === "object" && link.href) {
                                const absoluteUrl = new URL(link.href, baseUrl.origin).toString();
                                return { ...link, href: absoluteUrl };
                            }
                            return link;
                        });
                    } else if (linkValue && typeof linkValue === "object" && linkValue.href) {
                        const absoluteUrl = new URL(linkValue.href, baseUrl.origin).toString();
                        obj[key][linkKey] = { ...linkValue, href: absoluteUrl };
                    }
                }
            } else {
                convertLinksToAbsolute(obj[key], baseUrl);
            }
        }

        return obj;
    }

    return obj;
}