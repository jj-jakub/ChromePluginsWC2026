// .ics (iCalendar / RFC 5455) builder for "add to calendar". Classic self.WC content script
// (content can't import ES modules), so content.js can offer a download on a user gesture via a
// data: anchor — no "downloads" permission, no remote resource, no eval. Pure aside from the
// namespace assignment; covered by test/ics.test.mjs under the `self` shim.

(() => {
  const WC = (self.WC = self.WC || {});

  const MATCH_MINUTES = 105; // 90 + half-time + a little stoppage

  const pad = (n) => String(n).padStart(2, "0");

  // UTC timestamp "YYYYMMDDTHHMMSSZ".
  function icsDate(ms) {
    const d = new Date(ms);
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }

  // Fold a content line at 75 octets per RFC 5545 §3.1 (CRLF + single space continuation),
  // counting UTF-8 octets and never splitting a multi-byte codepoint.
  const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  function fold(line) {
    if (!enc || enc.encode(line).length <= 75) return line;
    const parts = [];
    let cur = "";
    let bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      const budget = parts.length === 0 ? 75 : 74; // continuations carry a 1-octet leading space
      if (bytes + b > budget) {
        parts.push(cur);
        cur = ch;
        bytes = b;
      } else {
        cur += ch;
        bytes += b;
      }
    }
    parts.push(cur);
    return parts.join("\r\n ");
  }

  // Escape per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline).
  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function vevent(m, stampMs) {
    const start = m.kickoffMs;
    const end = start + MATCH_MINUTES * 60000;
    const summary = `${m.home} vs ${m.away} — FIFA World Cup`;
    const lines = [
      "BEGIN:VEVENT",
      `UID:wc-${esc(m.id)}@worldcup-overlay`,
      `DTSTAMP:${icsDate(stampMs)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${esc(summary)}`,
    ];
    if (m.venue) lines.push(`LOCATION:${esc(m.venue)}`);
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(summary)}`,
      "END:VALARM",
      "END:VEVENT"
    );
    return lines;
  }

  /**
   * Build a complete .ics document for one or more matches (only those with a kickoff time).
   * @param {WcEvent[]} matches
   * @param {{stampMs?: number}} [opts]  stampMs = DTSTAMP (defaults to the earliest kickoff so the
   *                                     output is deterministic and Date.now()-free for tests)
   * @returns {string} CRLF-terminated iCalendar text
   */
  function toICS(matches, opts) {
    const list = (matches || []).filter((m) => m && m.kickoffMs != null);
    const stampMs = (opts && opts.stampMs) || (list.length ? Math.min(...list.map((m) => m.kickoffMs)) : 0);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//worldcup-overlay//FIFA World Cup 2026//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    for (const m of list) lines.push(...vevent(m, stampMs));
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  /** A safe-ish filename for a download. */
  function filenameFor(m) {
    if (m && m.home && m.away) {
      return `wc-${m.home}-vs-${m.away}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() + ".ics";
    }
    return "world-cup-fixtures.ics";
  }

  WC.ics = { toICS, filenameFor };
})();
