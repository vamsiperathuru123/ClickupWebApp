/** Collects the CSS text of every stylesheet currently loaded on the page, so the
 * exported HTML file is self-contained and looks right even opened outside the app. */
export function collectPageCss(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText)
    } catch {
      // Cross-origin stylesheets can't be read; nothing we render depends on one.
    }
  }
  return chunks.join('\n')
}

/** Builds a standalone HTML document from a report container, inlining the app's
 * own CSS and forcing the (normally print/export-only, visually hidden) container
 * visible regardless of the page's current display state. */
export function buildReportHtmlDocument(container: HTMLElement, title: string): string {
  const clone = container.cloneNode(true) as HTMLElement
  clone.style.display = 'block'
  clone.classList.remove('hidden')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
body { margin: 0; background: #1a1a1e; color: #f3f4f6; font-family: ui-sans-serif, system-ui, sans-serif; }
${collectPageCss()}
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`
}

/** Triggers a browser download of the given HTML string as a .html file. */
export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
