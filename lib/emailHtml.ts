/** Gmail and other clients add ~16px top margin on bare <p> tags — reset inline. */
export function wrapEmailHtml(content: string): string {
  const body = content
    .trim()
    .replace(/<p(?![^>]*\bstyle=)([^>]*)>/gi, '<p style="margin:0 0 1em 0;"$1>')

  return `<div style="font-family:sans-serif;line-height:1.6;color:#111;margin:0;padding:0;">${body}</div>`
}

export function textToEmailHtml(text: string): string {
  return text
    .split("\n\n")
    .map(
      (paragraph) =>
        `<p style="margin:0 0 1em 0;">${paragraph.replace(/\n/g, "<br/>")}</p>`
    )
    .join("")
}
