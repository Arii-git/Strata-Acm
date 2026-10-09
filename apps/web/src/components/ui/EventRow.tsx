import Link from "next/link";
import {
  IconBooks, IconCheck, IconCheckbox, IconCircleCheck, IconCircleX, IconClipboardList, IconDatabase, IconEdit,
  IconListCheck, IconMessage, IconPlugConnectedX, IconRadar, IconRepeat, IconReplace, IconSearch, IconTargetArrow,
  type Icon,
} from "@tabler/icons-react";

/** One classified event from GET /events. The only way events are shown anywhere in the console. */
export interface EventItem {
  id: number;
  type: string;
  label: string;
  icon: string;
  text: string;
  at: string;
  wall_at: string;
  incident: string | null;
  actor: string;
  actor_type: string;
  link: string | null;
  stage_index: number | null;
}

const ICONS: Record<string, Icon> = {
  radar: IconRadar, search: IconSearch, "list-check": IconListCheck, books: IconBooks, "clipboard-list": IconClipboardList,
  "circle-check": IconCircleCheck, edit: IconEdit, "circle-x": IconCircleX, replace: IconReplace, checkbox: IconCheckbox,
  check: IconCheck, "target-arrow": IconTargetArrow, database: IconDatabase, "plug-connected-x": IconPlugConnectedX,
  message: IconMessage, repeat: IconRepeat,
};

export function EventRow({ event, showIncident = true }: { event: EventItem; showIncident?: boolean }) {
  const Ico = ICONS[event.icon] ?? IconCheck;
  const time = new Date(event.wall_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = (
    <>
      <span className={`event-row__icon event-row__icon--${event.actor_type}`} aria-hidden="true"><Ico size={16} stroke={1.5} /></span>
      <span className="event-row__main">
        <span className="event-row__label">{event.label}{showIncident && event.incident ? <span className="mono muted"> · {event.incident}</span> : null}</span>
        <span className="event-row__text">{event.text}</span>
      </span>
      <time className="event-row__time mono" dateTime={event.wall_at}>{time}</time>
    </>
  );
  return (
    <li className="event-row" data-testid="event-row" data-event-type={event.type}>
      {event.link ? <Link href={event.link} className="event-row__link">{body}</Link> : <div className="event-row__link">{body}</div>}
    </li>
  );
}
