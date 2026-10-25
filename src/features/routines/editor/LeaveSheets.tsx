import { Pressable, View } from 'react-native';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { EditorSheet, SheetActions, SheetBody, SheetButton, SheetTitle } from './EditorSheet';

/** Back with unsaved changes: save them, or leave without them. */
export function LeaveSheet({
  colors,
  isNew,
  saveAllowed,
  onKeepEditing,
  onDiscard,
  onSave,
}: {
  colors: EditorColors;
  isNew: boolean;
  saveAllowed: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <EditorSheet colors={colors} onDismiss={onKeepEditing} testID="leave-sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SheetTitle colors={colors}>{isNew ? 'Create this routine?' : 'Save your changes?'}</SheetTitle>
        </View>
        <Pressable
          testID="leave-keep-editing"
          accessibilityRole="button"
          accessibilityLabel="Keep editing"
          onPress={onKeepEditing}
          style={{ width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" color={colors.muted} size={18} />
        </Pressable>
      </View>
      <SheetBody colors={colors}>
        {!isNew
          ? 'You changed this routine. If you leave without saving, those changes are lost.'
          : saveAllowed
            ? 'It hasn’t been created yet.'
            : 'It needs a name and at least one step before it can be created.'}
      </SheetBody>
      <SheetActions>
        <SheetButton colors={colors} variant="discardSoft" label="Discard" testID="leave-discard" onPress={onDiscard} />
        <SheetButton
          colors={colors}
          variant="strong"
          label={isNew ? 'Create' : 'Save'}
          testID="leave-save"
          disabled={!saveAllowed}
          onPress={onSave}
        />
      </SheetActions>
    </EditorSheet>
  );
}

/** The top bar's trash: delete the saved routine (the library then offers UNDO). */
export function DeleteRoutineSheet({
  colors,
  title,
  onCancel,
  onDelete,
}: {
  colors: EditorColors;
  /** The routine's name as shown (see displayTitle). */
  title: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <EditorSheet colors={colors} onDismiss={onCancel} testID="delete-sheet">
      <SheetTitle colors={colors}>Delete this routine?</SheetTitle>
      <SheetBody colors={colors}>{`“${title}” and its steps will be gone.`}</SheetBody>
      <SheetActions>
        <SheetButton colors={colors} variant="keep" label="Cancel" testID="delete-cancel" onPress={onCancel} />
        <SheetButton colors={colors} variant="discard" label="Delete" testID="delete-confirm" onPress={onDelete} />
      </SheetActions>
    </EditorSheet>
  );
}
