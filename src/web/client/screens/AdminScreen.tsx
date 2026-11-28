import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { adminPageQuerySchema, type AdminStatusResponse } from "../../shared/index.js";
import { ApiCallError, type PlaysetApi } from "../api/index.js";
import { Heading } from "../components/Heading.js";
import { LoadingLine } from "../components/LoadingLine.js";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useShownError, type ShownError } from "../hooks/useShownError.js";
import { AdminDashboard } from "./AdminDashboard.js";
import { AdminHeader } from "./AdminHeader.js";
import { AdminLoggedOut } from "./AdminLoggedOut.js";
import { AdminLoginProblem } from "./AdminLoginProblem.js";
import { AdminLogoutError } from "./AdminLogoutError.js";
import { AdminStatusError } from "./AdminStatusError.js";
import styles from "./AdminScreen.module.css";

type AdminAnswer = { loggedIn: false } | { loggedIn: true; status: AdminStatusResponse };

/** Not being the Host Account is not an error here: it is the logged-out view. */
async function readStatus(api: PlaysetApi, signal: AbortSignal): Promise<AdminAnswer> {
  try {
    return { loggedIn: true, status: await api.getAdminStatus(signal) };
  } catch (error) {
    if (error instanceof ApiCallError && error.code === "NOT_ADMIN") return { loggedIn: false };
    throw error;
  }
}

/** What the page shows now; each view carries only what it needs. */
type AdminView =
  | { kind: "loading" }
  | { kind: "error"; shown: ShownError }
  | { kind: "loggedOut" }
  | { kind: "dashboard"; status: AdminStatusResponse };

function adminView(shownError: ShownError | null, answer: AdminAnswer | undefined, loggedOutNow: boolean): AdminView {
  if (shownError !== null) return { kind: "error", shown: shownError };
  if (answer === undefined) return { kind: "loading" };
  if (loggedOutNow || !answer.loggedIn) return { kind: "loggedOut" };
  return { kind: "dashboard", status: answer.status };
}

/** `/admin`: the Host Account's status, config and usage for its admin, and the way to log in and out. */
export function AdminScreen() {
  const api = useApi();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentTitle("Admin – Playset");

  // Each opening of the page is its own request, so the numbers and the Host Account are current:
  // the answer is dropped once the page is left, and a new opening asks again.
  const answer = useQuery({
    queryKey: ["admin-status"],
    queryFn: ({ signal }) => readStatus(api, signal),
    gcTime: 0,
    refetchOnMount: "always",
  });
  const shownError = useShownError(answer.error, answer.isFetching);

  const logout = useMutation({ mutationFn: () => api.logOut() });
  function logOut() {
    logout.mutate(undefined, {
      // Only while the admin is still here: leaving does not cancel the logout, but nothing follows it.
      onSuccess: () => {
        void navigate("/admin", { replace: true });
        announce("Logged out");
      },
    });
  }

  const parsedQuery = adminPageQuerySchema.safeParse({ login: searchParams.get("login") ?? undefined });
  const loginProblem = parsedQuery.success ? parsedQuery.data.login : undefined;

  const view = adminView(shownError, answer.data, logout.isSuccess);
  const answered = view.kind === "loggedOut" || view.kind === "dashboard";
  const showLoginProblem = loginProblem !== undefined && answered;

  return (
    <div className={styles.screen}>
      <AdminHeader logOut={view.kind === "dashboard" ? { pending: logout.isPending, onActivate: logOut } : undefined} />
      {/* A new view is a new step: the heading is mounted again so focus lands on it again. */}
      <Heading
        key={`heading-${view.kind}`}
        level={1}
        className={styles.heading}
        focusWhen={answered && !showLoginProblem}
      >
        Admin
      </Heading>
      {logout.error === null ? null : <AdminLogoutError error={logout.error} />}
      {showLoginProblem ? <AdminLoginProblem key={`login-problem-${view.kind}`} code={loginProblem} /> : null}
      {view.kind === "loading" ? <LoadingLine text="Loading the status…" /> : null}
      {view.kind === "error" ? <AdminStatusError key={view.shown.key} shown={view.shown} onRetry={() => void answer.refetch()} /> : null}
      {view.kind === "loggedOut" ? <AdminLoggedOut /> : null}
      {view.kind === "dashboard" ? <AdminDashboard status={view.status} /> : null}
    </div>
  );
}
