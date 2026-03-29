'use client'

import ProjectInfoPanel from './ProjectInfoPanel'
import ScheduleImporter from './ScheduleImporter'
import FixtureAddForm from './FixtureAddForm'

interface Props {
  submittalId: string
  initialData: {
    projectName: string
    projectNumber: string | null
    preparedBy: string | null
    preparedFor: string | null
    revision: string | null
    notes: string | null
  }
  onRefresh: () => void
}

export default function SubmittalBuilder({ submittalId, initialData, onRefresh }: Props) {
  return (
    <div>
      <ProjectInfoPanel submittalId={submittalId} initialData={initialData} />
      <ScheduleImporter submittalId={submittalId} onImported={onRefresh} />
      <FixtureAddForm submittalId={submittalId} onAdded={onRefresh} />
    </div>
  )
}
