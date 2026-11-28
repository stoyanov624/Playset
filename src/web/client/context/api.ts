// The API client the screens use, injected so tests pass a fake.
import { createContext, useContext } from "react";
import type { PlaysetApi } from "../api/index.js";

export const ApiContext = createContext<PlaysetApi | null>(null);

export function useApi(): PlaysetApi {
  const api = useContext(ApiContext);
  if (api === null) throw new Error("useApi needs an ApiContext provider");
  return api;
}
