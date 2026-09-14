interface PublishScheduleProps {
  longVideoPublishDay: string
  onChange: (value: string) => void
  isScheduled: boolean
}

export function PublishSchedule({ longVideoPublishDay, onChange, isScheduled }: PublishScheduleProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <label htmlFor="publish-day" className="text-sm font-medium text-text-strong">
        Fecha propuesta para el video largo
      </label>
      <input
        id="publish-day"
        type="date"
        value={longVideoPublishDay}
        onChange={(event) => onChange(event.target.value)}
        className="w-fit rounded-lg border border-border bg-bg px-3 py-2 text-sm"
      />
      <p className="text-xs text-text-muted">Zona horaria detectada: {timeZone}</p>
      {isScheduled && <p className="text-xs text-text-muted">Programado por YouTube.</p>}
    </div>
  )
}
