import { useParams } from "react-router";
import { mbidSchema } from "../../shared/index.js";
import { NotFoundScreen } from "./NotFoundScreen.js";
import { SetlistListScreen } from "./SetlistListScreen.js";

/** `/artists/:mbid`: an address that can't be an Artist is Page not found, without asking the server. */
export function ArtistSetlistsRoute() {
  const parsed = mbidSchema.safeParse(useParams().mbid);
  return parsed.success ? <SetlistListScreen key={parsed.data} mbid={parsed.data} /> : <NotFoundScreen />;
}
