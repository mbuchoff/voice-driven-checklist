export type ChecklistItem = {
  id: string;
  text: string;
  order: number;
};

export type Checklist = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export type ChecklistSummary = {
  id: string;
  title: string;
  itemCount: number;
  updatedAt: number;
};

export type ChecklistInput = {
  title: string;
  items: ChecklistItemInput[];
};

export type ChecklistItemInput = {
  text: string;
};
