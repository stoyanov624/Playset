import { CircleCheck, CircleX } from "lucide-react";
import type { AdminStatusResponse } from "../../shared/index.js";
import { Heading } from "../components/Heading.js";
import { counted, formatCount } from "../format.js";
import { AdminHostAccount } from "./AdminHostAccount.js";
import { AdminUsageTable } from "./AdminUsageTable.js";
import styles from "./AdminDashboard.module.css";

/** The Host Account's state, the required config (names only) and the usage numbers. */
export function AdminDashboard({ status }: { status: AdminStatusResponse }) {
  const { usage } = status;
  const quietDays = usage.perDay.every((day) => day.created === 0 && day.updated === 0 && day.opened === 0);
  return (
    <>
      <div className={styles.overview}>
        <div>
          <AdminHostAccount hostAccount={status.hostAccount} />
          <Heading level={2} className={styles.section}>
            Config
          </Heading>
          {status.config.length === 0 ? (
            <p className={styles.empty}>No config reported.</p>
          ) : (
            <ul className={styles.config}>
              {status.config.map((item) => (
                <li key={item.name} className={styles.configItem}>
                  {item.present ? (
                    <CircleCheck size={20} aria-hidden="true" className={styles.icon} />
                  ) : (
                    <CircleX size={20} aria-hidden="true" className={`${styles.icon} ${styles.missing}`} />
                  )}
                  <span className={styles.configName}>{item.name}</span>{" "}
                  {item.present ? <span>present</span> : <span className={styles.missing}>missing</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <Heading level={2} className={styles.section}>
            Usage
          </Heading>
          <dl className={styles.usage}>
            <div>
              <dt>Playlists made</dt>
              <dd>{usage.playlistsMade === 0 ? "No playlists made yet." : formatCount(usage.playlistsMade)}</dd>
            </div>
            <div>
              <dt>Opens</dt>
              <dd>{usage.opens === 0 ? "No opens yet." : formatCount(usage.opens)}</dd>
            </div>
            <div>
              <dt>Rate-limit hits today</dt>
              <dd>{formatCount(status.rateLimitHitsToday)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <Heading level={2} className={styles.section}>
        Last 30 days
      </Heading>
      {quietDays ? <p className={styles.empty}>Nothing in the last 30 days.</p> : <AdminUsageTable days={usage.perDay} />}

      <Heading level={2} className={styles.section}>
        Top Artists
      </Heading>
      {usage.topArtists.length === 0 ? (
        <p className={styles.empty}>No Artists yet.</p>
      ) : (
        <ol className={styles.artists}>
          {usage.topArtists.map((top) => (
            <li key={top.artist}>
              <span className={styles.artist}>{top.artist}</span>{" "}
              <span>{counted(top.playlistCount, "playlist", "playlists")}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
