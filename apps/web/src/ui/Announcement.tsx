import { useEffect, useState } from "react";
import { fetchSite } from "../api";
import { dismissAnnouncement, dismissedAnnouncement } from "../storage";
import { Icon } from "./Icon";

/** The admins' announcement across the top of the page, until this browser closes it. */
export function Announcement() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchSite().then(
      (site) => {
        if (live && site.announcement && site.announcement !== dismissedAnnouncement()) {
          setText(site.announcement);
        }
      },
      // No announcement is the same as a failed one: the page works either way.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  if (!text) return null;
  return (
    <div className="announcement" role="status">
      <Icon name="bell" size={18} />
      <p>{text}</p>
      <button
        className="announcement-close"
        aria-label="Close the announcement"
        onClick={() => {
          dismissAnnouncement(text);
          setText(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
