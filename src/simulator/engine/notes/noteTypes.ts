import { NoteBase } from "./noteBase";

export class NoteFrontBase extends NoteBase {}

export class NoteAfterBase extends NoteBase {}

export class NoteLong extends NoteFrontBase {
  private afterNoteValue: NoteAfterBase | null = null;

  get afterNote(): NoteAfterBase | null {
    return this.afterNoteValue;
  }

  bindAfterNote(afterNote: NoteAfterBase): void {
    this.afterNoteValue = afterNote;
  }
}

export class NoteSlide extends NoteFrontBase {
  private afterNotesValue: readonly NoteSlideAfter[] = [];

  get afterNotes(): readonly NoteSlideAfter[] {
    return this.afterNotesValue;
  }

  bindAfterNotes(afterNotes: readonly NoteSlideAfter[]): void {
    this.afterNotesValue = [...afterNotes];
  }
}

export class NoteFlick extends NoteFrontBase {}

export class NoteDirectionalFlick extends NoteFrontBase {}

export class NoteMultipleDirectionalFlick extends NoteFrontBase {}

export class NoteFlickAfter extends NoteAfterBase {}

export class NoteDirectionalFlickAfter extends NoteAfterBase {}

export class NoteMultipleDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideAfter extends NoteAfterBase {}

export class NoteSlideFlickAfter extends NoteAfterBase {}

export class NoteSlideDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideMultipleDirectionalFlickAfter extends NoteAfterBase {}
