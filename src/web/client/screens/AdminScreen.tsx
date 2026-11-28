import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { adminPageQuerySchema, type AdminStatusResponse } from "../../shared/index.js";
import { ApiCallError, type PlaysetApi } from "../api/index.js";
import { Heading } from "../components/Heading.js";
import { LoadingLine } from "../components/LoadingLine.js";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useShownError } from "../hooks/useShownError.js";
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

// Each opening of the page is its own request, so the numbers and the Host Account are current.
let openings = 0;

/** `/admin`: the Host Account's status, config and usage for its admin, and the way to log in and out. */
export function AdminScreen() {
  const api = useApi();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentTitle("Admin – Playset");

  const [opening] = useState(() => (openings += 1));
  const answer = useQuery({
    queryKey: ["admin-status", opening],
    queryFn: ({ signal }) => readStatus(api, signal),
    gcTime: 0,
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

  let view: "loading" | "error" | "loggedOut" | "dashboard";
  if (shownError !== null) view = "error";
  else if (answer.data === undefined) view = "loading";
  else if (logout.isSuccess || !answer.data.loggedIn) view = "loggedOut";
  else view = "dashboard";
  const status = view === "dashboard" && answer.data?.loggedIn === true ? answer.data.status : undefined;
  const statusError = view === "error" ? shownError : null;
  const showLoginProblem = loginProblem !== undefined && (view === "loggedOut" || view === "dashboard");

  return (
    <div className={styles.screen}>
      <AdminHeader logOut={status === undefined ? undefined : { pending: logout.isPending, onActivate: logOut }} />
      {/* A new view is a new step: the heading is mounted again so focus lands on it again. */}
      <Heading
        key={`heading-${view}`}
        level={1}
        className={styles.heading}
        focusWhen={(view === "loggedOut" || view === "dashboard") && !showLoginProblem}
      >
        Admin
      </Heading>
      {logout.error === null ? null : <AdminLogoutError error={logout.error} />}
      {showLoginProblem ? <AdminLoginProblem key={`login-problem-${view}`} code={loginProblem} /> : null}
      {view === "loading" ? <LoadingLine text="Loading the status…" /> : null}
      {statusError === null ? null : <AdminStatusError shown={statusError} onRetry={() => void answer.refetch()} />}
      {view === "loggedOut" ? <AdminLoggedOut /> : null}
      {status === undefined ? null : <AdminDashboard status={status} />}
    </div>
  );
}
