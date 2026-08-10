import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Keyboard, ScrollView } from 'react-native';
import { State, type GestureType } from 'react-native-gesture-handler';

import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { ChecklistEditor } from './ChecklistEditor';
import { createChecklist, getChecklist } from './repository';

const { fireGestureHandler, getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

async function setupDb() {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

function dragRow(index: number, startY: number, endY: number) {
  const localId = screen.getByTestId(`item-row-${index}`).props.nativeID;
  act(() => {
    fireGestureHandler(getByGestureTestId(`item-hold-gesture-${localId}`), [
      { state: State.BEGAN, absoluteY: startY },
      { state: State.ACTIVE, absoluteY: startY },
      { state: State.ACTIVE, absoluteY: endY },
      { state: State.END, absoluteY: endY },
    ]);
  });
}

function beginRowDrag(index: number, startY: number, currentY: number): GestureType {
  const localId = screen.getByTestId(`item-row-${index}`).props.nativeID;
  const gesture = getByGestureTestId(`item-hold-gesture-${localId}`);
  act(() => {
    gesture.handlers.onStart?.({ absoluteY: startY } as never);
    gesture.handlers.onUpdate?.({ absoluteY: currentY } as never);
  });
  return gesture;
}

function finishRowDrag(gesture: GestureType) {
  act(() => {
    gesture.handlers.onEnd?.({} as never, true);
    gesture.handlers.onFinalize?.({} as never, true);
  });
}

function cancelRowDrag(gesture: GestureType) {
  act(() => {
    gesture.handlers.onFinalize?.({} as never, false);
  });
}

describe('ChecklistEditor', () => {
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

    it('uses the prototype icons for adding and deleting steps', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByTestId('add-step-icon')).toBeOnTheScreen();
      expect(screen.getByTestId('delete-step-icon-0')).toBeOnTheScreen();
      expect(screen.queryByText(/[♲＋]/)).toBeNull();
    });

    it('focuses and scrolls every newly added multiline step above the visible keyboard', async () => {
      const scrollToEnd = jest
        .spyOn(ScrollView.prototype, 'scrollToEnd')
        .mockImplementation(jest.fn());
      const keyboardListener = jest.spyOn(Keyboard, 'addListener');
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByTestId('item-text-1').props.multiline).toBe(true);
      expect(screen.getByTestId('item-text-1').props.autoFocus).toBe(true);

      const keyboardShown = keyboardListener.mock.calls.find(
        ([event]) => event === 'keyboardDidShow',
      );
      expect(keyboardShown).toBeDefined();
      act(() => {
        keyboardShown?.[1]({ endCoordinates: { screenY: 400 } } as never);
      });
      fireEvent(
        screen.getByTestId('checklist-editor-scroll'),
        'contentSizeChange',
        100,
        2_000,
      );

      expect(
        screen.getByTestId('checklist-editor-scroll').props
          .contentContainerStyle.paddingBottom,
      ).toBeGreaterThan(48);
      expect(scrollToEnd).toHaveBeenCalled();
      scrollToEnd.mockClear();

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByTestId('item-text-1').props.autoFocus).toBe(false);
      expect(screen.getByTestId('item-text-2').props.autoFocus).toBe(true);
      fireEvent(
        screen.getByTestId('checklist-editor-scroll'),
        'contentSizeChange',
        100,
        2_200,
      );
      expect(scrollToEnd).toHaveBeenCalled();

      fireEvent(screen.getByTestId('item-text-2'), 'blur');
      expect(screen.getByTestId('item-text-2').props.autoFocus).toBe(false);

      scrollToEnd.mockRestore();
      keyboardListener.mockRestore();
    });

    it('keeps Cancel and Save outside the scrolling checklist content', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      const scroll = within(screen.getByTestId('checklist-editor-scroll'));
      expect(scroll.queryByTestId('save')).toBeNull();
      expect(scroll.queryByTestId('cancel')).toBeNull();
      expect(screen.getByTestId('editor-actions')).toBeOnTheScreen();
      expect(screen.getByTestId('save')).toBeOnTheScreen();
      expect(screen.getByTestId('cancel')).toBeOnTheScreen();
    });

    it('keeps the sticky actions below Android system insets', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByTestId('editor-safe-area').props.edges.top).toBe(
        'additive',
      );
      expect(
        within(screen.getByTestId('editor-safe-area')).getByTestId(
          'editor-actions',
        ),
      ).toBeOnTheScreen();
    });

    it('persists a new checklist with trimmed title and trimmed item text on save', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.changeText(screen.getByTestId('title-input'), '  Groceries  ');
      fireEvent.press(screen.getByTestId('item-edit-0'));
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
      fireEvent.press(screen.getByTestId('item-edit-0'));
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
      fireEvent.press(screen.getByTestId('item-edit-0'));
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
    it('activates reordering from the whole row without a visible drag handle', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'hold row',
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

      expect(screen.queryByTestId('item-drag-handle-0')).toBeNull();
      expect(screen.getByTestId('item-row-0').props.accessibilityLabel).toMatch(
        /hold.*reorder/i,
      );

      dragRow(0, 25, 125);

      expect(screen.getByTestId('item-text-2').props.value).toBe('a');
    });
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
      fireEvent.press(screen.getByTestId('item-edit-0'));
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

    it('persists items reordered by holding and dragging a row', async () => {
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
      dragRow(0, 25, 125);
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
      const gesture = beginRowDrag(0, 25, 125);

      expect(screen.getByTestId('item-drag-preview')).toBeOnTheScreen();
      expect(screen.getByTestId('item-drag-preview-text').props.children).toBe('a');
      expect(screen.getByTestId('item-drop-target-2')).toBeOnTheScreen();
      expect(screen.getByTestId('item-drop-target-2').props.style.height).toBe(50);
      expect(screen.getByTestId('item-row-0').props.style.position).toBe('absolute');
      expect(screen.getByTestId('item-row-0').props.style.opacity).toBe(0);

      finishRowDrag(gesture);

      expect(screen.queryByTestId('item-drag-preview')).toBeNull();
      expect(screen.getByTestId('item-row-2').props.style.position).toBe('relative');
      expect(screen.getByTestId('item-row-2')).toBeOnTheScreen();
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
      dragRow(2, 125, 20);

      expect(screen.getByTestId('item-text-0').props.value).toBe('c');

      beginRowDrag(0, 25, 25);

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
      dragRow(2, 125, 20);

      dragRow(0, 25, 125);

      expect(screen.getByTestId('item-text-2').props.value).toBe('c');

      beginRowDrag(2, 125, 125);

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

      beginRowDrag(2, 289, 340);

      expect(scrollTo).toHaveBeenCalledWith({ y: 32, animated: false });
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

      dragRow(0, 25, 290);

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
      const gesture = beginRowDrag(0, 25, 125);
      cancelRowDrag(gesture);

      expect(screen.getByTestId('item-text-0').props.value).toBe('a');
      expect(screen.queryByTestId('item-drag-preview')).toBeNull();
    });

    it('waits for a hold before disabling native scroll for the row drag', async () => {
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

      const localId = screen.getByTestId('item-row-0').props.nativeID;
      const gesture = getByGestureTestId(`item-hold-gesture-${localId}`);
      expect(gesture.config.activateAfterLongPress).toBe(350);
      expect(screen.getByTestId('checklist-editor-scroll').props.scrollEnabled).toBe(true);

      beginRowDrag(0, 25, 25);

      expect(screen.getByTestId('item-drag-preview')).toBeOnTheScreen();
      expect(screen.getByTestId('checklist-editor-scroll').props.scrollEnabled).toBe(false);

      finishRowDrag(gesture);
    });

    it('enters native text editing only after a quick tap on an idle step', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'keep drag',
        items: [{ text: 'hold this text' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      expect(screen.getByTestId('item-text-0').props.editable).toBe(false);
      expect(screen.getByTestId('item-text-0').props.pointerEvents).toBe(
        'none',
      );

      fireEvent.press(screen.getByTestId('item-edit-0'));
      expect(screen.getByTestId('item-text-0').props.editable).toBe(true);
      expect(screen.getByTestId('item-text-0').props.pointerEvents).toBe(
        'auto',
      );

      fireEvent(screen.getByTestId('item-text-0'), 'blur');
      expect(screen.getByTestId('item-text-0').props.editable).toBe(false);
    });

    it('uses the whole row and accessible adjustments without visible move controls', async () => {
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

      expect(screen.queryByTestId('item-drag-handle-0')).toBeNull();
      expect(screen.getByLabelText(/reorder step 1/i).props.accessibilityActions).toEqual([
        { name: 'decrement', label: 'Move up' },
        { name: 'increment', label: 'Move down' },
      ]);
      expect(screen.getByLabelText(/reorder step 2/i)).toBeOnTheScreen();
      expect(screen.queryByTestId('item-move-up-0')).toBeNull();
      expect(screen.queryByTestId('item-move-down-1')).toBeNull();
    });
  });
});
