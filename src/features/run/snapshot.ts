import type { Checklist } from '../checklists/types';

import type { ChecklistRunSnapshot } from './types';

export function createSnapshot(checklist: Checklist): ChecklistRunSnapshot {
  return {
    checklistId: checklist.id,
    checklistTitle: checklist.title,
    items: checklist.items.map((item) => ({ ...item })),
  };
}
