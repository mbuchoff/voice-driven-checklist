import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Keyboard, ScrollView } from 'react-native';

import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { ChecklistEditor, focusEditorInput } from './ChecklistEditor';
import {
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './ChecklistEditor.testSupport';
import { getChecklist } from './repository';

describe('ChecklistEditor', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('requests native focus when a step enters editing', () => {
    const focus = jest.fn();

    focusEditorInput({ focus });

    expect(focus).toHaveBeenCalledTimes(1);
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
      expect(screen.queryByTestId('routine-delete')).toBeNull();
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
      const revealInput = jest
        .spyOn(
          ScrollView.prototype,
          'scrollResponderScrollNativeHandleToKeyboard',
        )
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
      expect(revealInput).toHaveBeenCalled();
      revealInput.mockClear();

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByTestId('item-text-1').props.autoFocus).toBe(false);
      expect(screen.getByTestId('item-text-2').props.autoFocus).toBe(true);
      fireEvent(
        screen.getByTestId('checklist-editor-scroll'),
        'contentSizeChange',
        100,
        2_200,
      );
      expect(revealInput).toHaveBeenCalled();

      fireEvent(screen.getByTestId('item-text-2'), 'blur');
      expect(screen.getByTestId('item-text-2').props.autoFocus).toBe(false);

      revealInput.mockRestore();
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
      tapToEdit(0);
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
      tapToEdit(0);
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
      tapToEdit(0);
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

});
