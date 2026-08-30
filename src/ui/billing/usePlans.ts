import { useEffect, useState } from 'react'
import type { Plan } from '@domain/billing'
import { billingApi } from '@ui/billing/composition'

export function usePlans(): { plans: Plan[]; plansLoaded: boolean } {
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)

  useEffect(() => {
    void billingApi.getPlans().then((result) => {
      if (result.ok) {
        setPlans(result.value)
      }
      setPlansLoaded(true)
    })
  }, [])

  return { plans, plansLoaded }
}
