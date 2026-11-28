// The page's one polite live region: screens hand it short sentences to read out.
import { createContext, useContext } from "react";

export type Announce = (text: string) => void;

export const AnnouncerContext = createContext<Announce>(() => undefined);

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
