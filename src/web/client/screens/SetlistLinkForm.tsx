import { useMutation } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { ErrorCode } from "../../shared/index.js";
import { ApiCallError } from "../api/index.js";
import { Button } from "../components/Button.js";
import { describedByIds, FieldProblem } from "../components/FieldProblem.js";
import { ScreenError } from "../components/ScreenError.js";
import { useApi } from "../context/api.js";
import { useShownError } from "../hooks/useShownError.js";
import styles from "./form.module.css";

/** Answers about the link itself belong on the field; anything else is a screen error under it. */
const FIELD_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["INVALID_INPUT", "NOT_FOUND"]);

/** Opens a Setlist straight from its setlist.fm page link; the server decides whether it is one. */
export function SetlistLinkForm() {
  const api = useApi();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const [emptyTried, setEmptyTried] = useState(false);
  const [sentLink, setSentLink] = useState("");
  const reading = useRef(false);
  const read = useMutation({ mutationFn: (link: string) => api.readSetlistLink(link) });
  const shown = useShownError(read.error, read.isPending);

  function open(link: string) {
    if (reading.current) return;
    reading.current = true;
    setSentLink(link);
    read.mutate(link, {
      onSuccess: ({ setlistId }) => void navigate(`/setlists/${setlistId}`),
      onError: (error) => {
        if (error instanceof ApiCallError && FIELD_CODES.has(error.code)) input.current?.focus();
      },
      onSettled: () => {
        reading.current = false;
      },
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const link = value.trim();
    if (link === "") {
      setEmptyTried(true);
      input.current?.focus();
      return;
    }
    setEmptyTried(false);
    open(link);
  }

  const fieldError = shown !== null && FIELD_CODES.has(shown.error.code) ? shown.error : null;
  const problem = emptyTried
    ? { message: "Paste a setlist.fm Setlist link to open it.", hint: undefined }
    : fieldError === null
      ? null
      : { message: fieldError.message, hint: fieldError.hint };

  return (
    <>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label htmlFor={`${messageId}-input`} className={styles.label}>
          setlist.fm link
        </label>
        <div className={styles.row}>
          <input
            ref={input}
            id={`${messageId}-input`}
            className={styles.input}
            type="url"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            placeholder="https://www.setlist.fm/setlist/…"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={problem === null ? undefined : "true"}
            aria-describedby={problem === null ? undefined : describedByIds(messageId, hintId, problem.hint)}
          />
          <Button type="submit" variant="secondary" wide icon={<Link2 size={20} aria-hidden="true" />} busy={read.isPending}>
            {read.isPending ? "Opening…" : "Open"}
          </Button>
        </div>
        {problem === null ? null : <FieldProblem messageId={messageId} hintId={hintId} message={problem.message} hint={problem.hint} />}
      </form>
      {shown !== null && fieldError === null && !emptyTried ? (
        <ScreenError key={shown.key} error={shown.error} headingLevel={2} retrying={shown.retrying} onRetry={() => open(sentLink)} />
      ) : null}
    </>
  );
}
