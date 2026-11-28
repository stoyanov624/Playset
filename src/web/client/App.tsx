import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router";
import type { PlaysetApi } from "./api/index.js";
import { Layout } from "./components/Layout.js";
import { ApiContext } from "./context/api.js";
import { AdminScreen } from "./screens/AdminScreen.js";
import { ArtistSetlistsRoute } from "./screens/ArtistSetlistsRoute.js";
import { NotFoundScreen } from "./screens/NotFoundScreen.js";
import { SetlistRoute } from "./screens/SetlistRoute.js";
import { StartScreen } from "./screens/StartScreen.js";
import { TermsScreen } from "./screens/TermsScreen.js";

export interface AppProps {
  api: PlaysetApi;
  /** Start in an in-memory history at this path instead of the browser's address. */
  initialPath?: string;
}

/**
 * Answers already shown are kept for the visit so Back shows them again without a request; the
 * Visitor decides when to try again, since an automatic retry could hit a rate limit.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false },
      mutations: { retry: false },
    },
  });
}

function Router({ initialPath, children }: { initialPath: string | undefined; children: ReactNode }) {
  return initialPath === undefined ? (
    <BrowserRouter>{children}</BrowserRouter>
  ) : (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
}

/** The web app: the Visitor screens and the admin page. */
export function App({ api, initialPath }: AppProps) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        <Router initialPath={initialPath}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<StartScreen />} />
              <Route path="artists/:mbid" element={<ArtistSetlistsRoute />} />
              <Route path="setlists/:id" element={<SetlistRoute />} />
              <Route path="terms" element={<TermsScreen />} />
              <Route path="admin" element={<AdminScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Route>
          </Routes>
        </Router>
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}
