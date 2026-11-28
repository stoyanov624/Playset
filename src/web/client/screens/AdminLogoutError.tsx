import { asApiCallError } from "../api/index.js";
import { AlertBox } from "../components/AlertBox.js";

/** The logout didn't go through: the dashboard stays and "Log out" can be pressed again. */
export function AdminLogoutError({ error }: { error: unknown }) {
  const shown = asApiCallError(error);
  return (
    <AlertBox tone="caution" announce title={<p>{shown.message}</p>}>
      {shown.hint === undefined ? null : <p>{shown.hint}</p>}
    </AlertBox>
  );
}
