import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnnounce } from "../context/announcer.js";
import { Button } from "./Button.js";

const COPIED_FOR_MS = 2000;

/** Copies the share link; the confirmation is inline and in the live region, never a toast. */
export function CopyLinkButton({ url }: { url: string }) {
  const announce = useAnnounce();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      announce("The link couldn't be copied. Select the link text and copy it.");
      return;
    }
    setCopied(true);
    announce("Link copied");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <Button
      variant="secondary"
      icon={copied ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
      onActivate={() => void copy()}
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
