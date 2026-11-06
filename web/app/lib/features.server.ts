import bundled from "../../content/features.json";
import { remoteContent } from "./remote.server";
import { parseSiteContent, toSiteContent } from "./siteContent";

const fallback = toSiteContent(bundled);
if (!fallback) throw new Error("web/content/features.json is malformed");

export const loadFeatures = remoteContent("web/content/features.json", parseSiteContent, fallback);
