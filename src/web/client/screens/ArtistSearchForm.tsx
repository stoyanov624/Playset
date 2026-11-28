import { Search } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { ApiCallError } from "../api/index.js";
import { Button } from "../components/Button.js";
import { describedByIds, FieldProblem } from "../components/FieldProblem.js";
import { useFocusWhen } from "../hooks/useFocusWhen.js";
import styles from "./form.module.css";

export interface ArtistSearchFormProps {
  /** The searched name from the URL, which the input shows. */
  artist: string;
  searching: boolean;
  /** The server refused the name itself (too long, say): shown on the field, not as a screen error. */
  serverProblem: ApiCallError | null;
}

/** Searching puts the name in the URL, so Back and a shared link return to the same candidates. */
export function ArtistSearchForm({ artist, searching, serverProblem }: ArtistSearchFormProps) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const hintId = useId();
  const [value, setValue] = useState(artist);
  const [shownArtist, setShownArtist] = useState(artist);
  const [emptyTried, setEmptyTried] = useState(false);
  if (artist !== shownArtist) {
    setShownArtist(artist);
    setValue(artist);
    setEmptyTried(false);
  }
  useFocusWhen(input, serverProblem !== null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (searching) return;
    const name = value.trim();
    if (name === "") {
      setEmptyTried(true);
      input.current?.focus();
      return;
    }
    setEmptyTried(false);
    setValue(name);
    if (name !== artist) void navigate({ pathname: "/", search: `?artist=${encodeURIComponent(name)}` });
  }

  const problem = emptyTried
    ? { message: "Type an Artist's name to search.", hint: undefined }
    : serverProblem === null
      ? null
      : { message: serverProblem.message, hint: serverProblem.hint };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor={`${messageId}-input`} className={styles.label}>
        Artist
      </label>
      <div className={styles.row}>
        <input
          ref={input}
          id={`${messageId}-input`}
          className={styles.input}
          name="artist"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={problem === null ? undefined : "true"}
          aria-describedby={problem === null ? undefined : describedByIds(messageId, hintId, problem.hint)}
        />
        <Button type="submit" variant="primary" wide icon={<Search size={20} aria-hidden="true" />} busy={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>
      {problem === null ? null : <FieldProblem messageId={messageId} hintId={hintId} message={problem.message} hint={problem.hint} />}
    </form>
  );
}
