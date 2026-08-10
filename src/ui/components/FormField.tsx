import type { InputHTMLAttributes } from 'react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function FormField({ label, id, ...inputProps }: FormFieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm text-text">
      {label}
      <input
        id={id}
        className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none transition-colors placeholder:text-text-muted focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
        {...inputProps}
      />
    </label>
  )
}
