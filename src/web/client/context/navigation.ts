// Whether the Visitor has moved inside the app yet: only a plain first load keeps focus at the top.
import { createContext, useContext } from "react";

export const NavigatedContext = createContext(false);

export function useHasNavigated(): boolean {
  return useContext(NavigatedContext);
}
