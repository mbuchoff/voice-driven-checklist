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

export type LibraryChecklist = {
  id: string;
  title: string;
  items: ChecklistItemInput[];
};

export type ChecklistInput = {
  title: string;
  items: ChecklistItemInput[];
};

export type ChecklistItemInput = {
  text: string;
};
