import type { ErrorCode } from "../../shared/index.js";
import { AlertBox } from "../components/AlertBox.js";
import { Heading } from "../components/Heading.js";

/**
 * The login comes back with only a code, so the words are the page's own. The server's admin login
 * callback (web contract) sends NOT_ADMIN for another account, INVALID_INPUT for a denied consent or a missing,
 * wrong or unreadable answer, UPSTREAM_UNAVAILABLE when Spotify can't be reached, and INTERNAL otherwise;
 * a code without its own words here gets the general one.
 */
function wording(code: ErrorCode): { title: string; body: string } {
  switch (code) {
    case "NOT_ADMIN":
      return {
        title: "That Spotify account isn't the Host Account.",
        body: "Nothing was changed. Log in with the Spotify account Playset uses as its Host Account.",
      };
    case "INVALID_INPUT":
      return {
        title: "The Spotify login didn't finish.",
        body: "Spotify didn't confirm the login, or it was cancelled. Log in with Spotify again.",
      };
    case "UPSTREAM_UNAVAILABLE":
      return { title: "Spotify isn't answering right now.", body: "Try logging in again in a minute." };
    default:
      return { title: "The login didn't work.", body: "Something went wrong on our side. Try logging in again in a minute." };
  }
}

/** Why the last login didn't work; it is the news the admin came back for, so it takes focus. */
export function AdminLoginProblem({ code }: { code: ErrorCode }) {
  const { title, body } = wording(code);
  return (
    <AlertBox
      tone="caution"
      title={
        <Heading level={2} focusWhen>
          {title}
        </Heading>
      }
    >
      <p>{body}</p>
    </AlertBox>
  );
}
