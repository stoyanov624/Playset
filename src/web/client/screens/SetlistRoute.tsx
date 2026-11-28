import { useParams } from "react-router";
import { setlistIdSchema } from "../../shared/index.js";
import { NotFoundScreen } from "./NotFoundScreen.js";
import { SetlistScreen } from "./SetlistScreen.js";

/** `/setlists/:id`: an address that can't be a Setlist is Page not found, without asking the server. */
export function SetlistRoute() {
  const parsed = setlistIdSchema.safeParse(useParams().id);
  return parsed.success ? <SetlistScreen key={parsed.data} id={parsed.data} /> : <NotFoundScreen />;
}
