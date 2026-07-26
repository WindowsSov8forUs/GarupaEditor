void NoteManager.ExecUpdate(float deltaTime)
{
    foreach (substep) {
        AdvanceMusicClock();

        activeAfterUpdate.Clear();
        for (int i = activeNotes.Count - 1; i >= 0; i--) {
            NoteBase note = activeNotes[i];
            note.ExecuteUpdate(deltaTime);
            if (!note.IsStateDeactive)
                activeAfterUpdate.Add(note);
        }

        foreach (NoteBase note in activeAfterUpdate)
            note.ExecuteAfterUpdate();

        playNoteGroupInformationList();
    }
}

void NoteManager.playNoteGroupInformationList()
{
    if (NoteGroupIndex >= noteGroups.Count) return;
    if (activateNotesJustNow(noteGroups[NoteGroupIndex]))
        NoteGroupIndex++;
}

void NoteManager.activateNoteAndConnectSyncLine(NoteGroup group)
{
    NoteBase previous = null;
    for (int memberIndex = 0; memberIndex < group.Count; memberIndex++) {
        NoteInformation info = group[memberIndex];
        if (IsCommandOrAlreadyConsumed(info)) continue;

        NoteBase note = activateNote(info);
        ConnectLongSlideDirectionalAndSyncRelations(previous, note, info);
        previous = SelectNextConnectionAnchor(previous, note);
    }
    FinalizeLongEndAndSyncLineConnections();
}

NoteBase NoteManager.activateNote(NoteInformation info)
{
    int poolIndex = info.PoolIndex;
    int cursor = poolCursors[poolIndex];
    poolCursors[poolIndex] = (cursor + 1) % notePools[poolIndex].Count;
    NoteBase note = FindNextDeactiveObjectFromCursor(notePools[poolIndex], cursor);
    note.SetActive(true);
    note.Activate(info, speed);
    return note;
}

// Consequence of the confirmed call order:
// 1. group members append to activeNotes in member-index order;
// 2. activation happens after the current substep's update/after-update passes;
// 3. on the next substep, the last appended simultaneous member updates first;
// 4. after-update preserves that reverse update order and excludes notes deactivated during update.
