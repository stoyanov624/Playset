import { LoaderCircle } from "lucide-react";
import styles from "./Spinner.module.css";

/** The loading icon; it stands still when the Visitor asks for reduced motion. */
export function Spinner() {
  return <LoaderCircle size={20} aria-hidden="true" className={styles.spinner} />;
}
