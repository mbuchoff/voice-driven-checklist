import { act, fireEvent, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { ChecklistEditor } from './ChecklistEditor';
import { createChecklist, getChecklist } from './repository';

async function setupDb() {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

let gestureTime = 1;

function dragEvent(pageY: number) {
  const timestamp = gestureTime;
  gestureTime += 1;
  return {
    nativeEvent: { pageY },
    touchHistory: {
      touchBank: [
        {
          touchActive: true,
          currentPageX: 0,
          currentPageY: pageY,
          currentTimeStamp: timestamp,
          previousPageX: 0,
          previousPageY: pageY,
          previousTimeStamp: timestamp - 1,
        },
      ],
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      numberActiveTouches: 1,
    },
  };
}

describe('ChecklistEditor', () => {
  beforeEach(() => {
    gestureTime = 1;
  });

  describe('create mode', () => {
    it('renders an empty form with a single blank item row by default', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByTestId('title-input').props.value).toBe('');
      expect(screen.getByTestId('item-text-0').props.value).toBe('');
      expect(screen.queryByTestId('item-text-1')).toBeNull();
    });

    it('adds a new blank item row when Add item is pressed', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
    });

    it('persists a new checklist with trimmed title and trimmed item text on save', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.changeText(screen.getByTestId('title-input'), '  Groceries  ');
      fireEvent.changeText(screen.getByTestId('item-text-0'), '  Milk  ');
      fireEvent.press(screen.getByTestId('add-item'));
      fireEvent.changeText(screen.getByTestId('item-text-1'), '  Bread  ');

      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      expect(onSaved).toHaveBeenCalledTimes(1);
      const saved = onSaved.mock.calls[0][0];
      expect(saved.title).toBe('Groceries');
      expect(saved.items.map((i: { text: string }) => i.text)).toEqual(['Milk', 'Bread']);

      const reloaded = await getChecklist(database, saved.id);
      expect(reloaded?.title).toBe('Groceries');
      expect(reloaded?.items.map((i) => i.text)).toEqual(['Milk', 'Bread']);
    });

    it('blocks save and shows a validation error when the title is blank', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'valid');
      fireEvent.press(screen.getByTestId('save'));

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByText(/title is required/i)).toBeOnTheScreen();
    });

    it('blocks save and shows a validation error when any item text is blank', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('title-input'), 'Title');
      fireEvent.press(screen.getByTestId('add-item'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'valid');
      // Leave item-text-1 blank.
      fireEvent.press(screen.getByTestId('save'));

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByTestId('item-error-1')).toBeOnTheScreen();
    });

    it('allows saving a draft checklist with no items as long as the title is valid', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('title-input'), 'Draft');
      fireEvent.press(screen.getByTestId('item-delete-0'));
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      expect(onSaved).toHaveBeenCalledTimes(1);
      const saved = onSaved.mock.calls[0][0];
      expect(saved.items).toEqual([]);
    });

    it('calls onCancel when the cancel button is pressed', async () => {
      const database = await setupDb();
      const onCancel = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={onCancel} />,
        { database },
      );

      fireEvent.press(screen.getByTestId('cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit mode', () => {
    it('pre-fills the form from the initial checklist and updates it on save', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'Original',
        items: [{ text: 'one' }, { text: 'two' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      expect(screen.getByTestId('title-input').props.value).toBe('Original');
      expect(screen.getByTestId('item-text-0').props.value).toBe('one');
      expect(screen.getByTestId('item-text-1').props.value).toBe('two');

      fireEvent.changeText(screen.getByTestId('title-input'), 'Renamed');
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'uno');
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const saved = onSaved.mock.calls[0][0];
      expect(saved.id).toBe(existing.id);
      expect(saved.title).toBe('Renamed');
      expect(saved.items.map((i: { text: string }) => i.text)).toEqual(['uno', 'two']);
    });

    it('removes an item and shifts positions contiguously after save', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'x',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent.press(screen.getByTestId('item-delete-1')); // remove 'b'
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const reloaded = await getChecklist(database, existing.id);
      expect(reloaded?.items.map((i) => ({ text: i.text, order: i.order }))).toEqual([
        { text: 'a', order: 0 },
        { text: 'c', order: 1 },
      ]);
    });

    it('reorders items by dragging a handle', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'reorder me',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderMove', dragEvent(125));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderRelease', dragEvent(125));
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const reloaded = await getChecklist(database, existing.id);
      expect(reloaded?.items.map((i) => i.text)).toEqual(['b', 'c', 'a']);
    });

    it('shows a floating preview and insertion target while dragging', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'preview me',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderMove', dragEvent(125));

      expect(screen.getByTestId('item-drag-preview')).toBeOnTheScreen();
      expect(screen.getByTestId('item-drag-preview-text').props.children).toBe('a');
      expect(screen.getByTestId('item-drop-target-2')).toBeOnTheScreen();

      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderRelease', dragEvent(125));

      expect(screen.queryByTestId('item-drag-preview')).toBeNull();
    });

    it('starts a second drag from the item current row after reordering', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'drag again',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderGrant', dragEvent(125));
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderMove', dragEvent(20));
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderRelease', dragEvent(20));

      expect(screen.getByTestId('item-text-0').props.value).toBe('c');

      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));

      expect(screen.getByTestId('item-drag-preview').props.style.top).toBe(0);
      expect(screen.getByTestId('item-drag-preview-text').props.children).toBe('c');
    });

    it('does not reuse temporary drop-gap layouts on later drags', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'drag cleanly',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderGrant', dragEvent(125));
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderMove', dragEvent(20));
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 116, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderRelease', dragEvent(20));

      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderMove', dragEvent(125));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderRelease', dragEvent(125));

      expect(screen.getByTestId('item-text-2').props.value).toBe('c');

      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderGrant', dragEvent(125));

      expect(screen.getByTestId('item-drag-preview').props.style.top).toBe(100);
    });

    it('autoscrolls when the pointer is near the visible scroll edge below the header', async () => {
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(jest.fn());
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'scroll me',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('checklist-editor-scroll'), 'layout', {
        nativeEvent: { layout: { y: 64, height: 300 } },
      });
      fireEvent(screen.getByTestId('checklist-editor-scroll'), 'contentSizeChange', 0, 1000);
      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });

      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderGrant', dragEvent(289));
      fireEvent(screen.getByTestId('item-drag-handle-2'), 'responderMove', dragEvent(340));

      expect(scrollTo).toHaveBeenCalledWith({ y: 28, animated: false });
      scrollTo.mockRestore();
    });

    it('updates the drop target after autoscroll before release', async () => {
      jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(jest.fn());
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'scroll target',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('checklist-editor-scroll'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 300 } },
      });
      fireEvent(screen.getByTestId('checklist-editor-scroll'), 'contentSizeChange', 0, 1000);
      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 300, height: 20 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 650, height: 50 } },
      });

      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderMove', dragEvent(290));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderRelease', dragEvent(290));

      expect(screen.getByTestId('item-text-1').props.value).toBe('a');
      jest.restoreAllMocks();
    });

    it('cancels a drag when the responder is terminated', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'cancel drag',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-1'), 'layout', {
        nativeEvent: { layout: { y: 50, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-row-2'), 'layout', {
        nativeEvent: { layout: { y: 100, height: 50 } },
      });
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderGrant', dragEvent(25));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderMove', dragEvent(125));
      fireEvent(screen.getByTestId('item-drag-handle-0'), 'responderTerminate', dragEvent(125));

      expect(screen.getByTestId('item-text-0').props.value).toBe('a');
      expect(screen.queryByTestId('item-drag-preview')).toBeNull();
    });

    it('blocks native scroll from taking over a handle drag', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'keep drag',
        items: [{ text: 'a' }, { text: 'b' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('item-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });

      const handle = screen.getByTestId('item-drag-handle-0');
      expect(handle.props.onStartShouldSetResponder(dragEvent(25))).toBe(true);
      expect(handle.props.onMoveShouldSetResponder(dragEvent(125))).toBe(true);
      expect(handle.props.onResponderTerminationRequest(dragEvent(125))).toBe(false);

      let grantResult: unknown;
      act(() => {
        grantResult = handle.props.onResponderGrant(dragEvent(25));
      });
      expect(grantResult).toBe(true);
      expect(screen.getByTestId('item-drag-preview')).toBeOnTheScreen();

      fireEvent(handle, 'responderRelease', dragEvent(25));
    });

    it('shows drag handles instead of visible move controls', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'x',
        items: [{ text: 'a' }, { text: 'b' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      expect(screen.getByTestId('item-drag-handle-0')).toBeOnTheScreen();
      expect(screen.getByTestId('item-drag-handle-1')).toBeOnTheScreen();
      expect(screen.queryByTestId('item-move-up-0')).toBeNull();
      expect(screen.queryByTestId('item-move-down-1')).toBeNull();
    });
  });
});
