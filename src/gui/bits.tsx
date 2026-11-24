import { Index } from "solid-js"

/** First line of a reasoning part, cut to fit a collapsed block's summary. */
function reasoningSummary(text: string): string {
  const nl = text.indexOf("\n")
  const line = (nl < 0 ? text : text.slice(0, nl)).trim()
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

/** The collapsible reasoning blocks of the inline row panel and the detail transcript share this markup. */
export function ReasonBlocks(props: { blocks: () => string[] }) {
  return (
    <Index each={props.blocks()}>
      {(block) => (
        <details class="sd-reason-block">
          <summary>
            <span>{reasoningSummary(block())}</span>
          </summary>
          <div class="sd-reason-text" tabIndex={0}>
            {block()}
          </div>
        </details>
      )}
    </Index>
  )
}

/** One token bucket: its icon, its text and the full label for screen readers, both on the same chip. */
export function TokenChip(props: { icon: string; label: string; text: string }) {
  return (
    <span class="sd-tok" role="img" aria-label={props.label}>
      <span class="sd-tok-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span class="sd-tok-text">{props.text}</span>
    </span>
  )
}
