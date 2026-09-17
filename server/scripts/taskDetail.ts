import { fetchTask, fetchStatusHistory } from '@/lib/mcp/clickupService'

/**
 * Follow-up detail for one task the digest only summarized — full description,
 * custom fields (e.g. Impacted Metric, often 1000+ chars and deliberately left out
 * of the digest), and real status history. Used when a question turns on the
 * wording of a field the digest only flagged as "set" rather than quoted in full.
 *
 * Usage: tsx scripts/taskDetail.ts <token> <taskId>
 */
async function main() {
  const [token, taskId] = process.argv.slice(2)
  if (!token || !taskId) {
    console.error('Usage: tsx scripts/taskDetail.ts <token> <taskId>')
    process.exit(1)
  }

  const [task, history] = await Promise.all([fetchTask(token, taskId), fetchStatusHistory(token, taskId)])

  console.log(JSON.stringify({ task, statusHistory: history }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
