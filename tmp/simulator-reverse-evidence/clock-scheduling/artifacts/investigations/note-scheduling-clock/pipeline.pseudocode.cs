enum NoteState { Move = 0, Wait = 1, Stop = 2, Deactive = 3 }

float NoteUtility.GetBarSeconds(float bpm) => 240.0f / bpm;

float InGameMusicScoreController.MusicPos =>
    musicBeatProgress + UnitsPerBar * musicBarProgress;

void InGameMusicScoreController.UpdateMusicScoreProgress(float deltaTime)
{
    float musicUnitsPerSecond = UnitsPerBar / GetBarSeconds(CurrentBPM);
    musicBeatProgress += deltaTime * musicUnitsPerSecond;
    CarryWholeBars(ref musicBarProgress, ref musicBeatProgress);

    float launcherUnitsPerSecond = UnitsPerBar / GetBarSeconds(NextBPM);
    launcherMusicBeatProgress += deltaTime * launcherUnitsPerSecond;
    CarryWholeBars(ref launcherMusicBarProgress, ref launcherMusicBeatProgress);
    onMusicPosUpdated?.Invoke(MusicPos);
}

void NoteManager.ExecUpdate(float deltaTime)
{
    int substeps = SelectSubstepCount(deltaTime); // 1, 2, 3, or 4
    float stepDelta = deltaTime / substeps;

    for (int step = 0; step < substeps; step++) {
        musicScoreController.UpdateMusicScoreProgress(stepDelta);
        UpdateAuxiliaryNoteObjects();

        activeAfterUpdate.Clear();
        for (int i = notes.Count - 1; i >= 0; i--) {
            NoteBase note = notes[i];
            note.ExecuteUpdate(stepDelta);
            if (!note.IsStateDeactive)
                activeAfterUpdate.Add(note);
        }

        foreach (NoteBase note in activeAfterUpdate)
            note.ExecuteAfterUpdate();

        playNoteGroupInformationList();
    }
}

void NoteBase.ExecuteUpdate(float deltaTime)
{
    totalElapsed += deltaTime;
    switch (NoteState) {
        case NoteState.Move:
            moveElapsed += deltaTime;
            MoveState(deltaTime);
            break;
        case NoteState.Wait:
            waitElapsed += deltaTime;
            WaitState(deltaTime);
            break;
        case NoteState.Stop:
            stopElapsed += deltaTime;
            StopState(deltaTime);
            break;
        case NoteState.Deactive:
            return;
    }
    OnUpdate(deltaTime);
}

float NoteManager.GetAdjustMusicPos()
{
    float raw = musicScoreController.MusicPos;
    int judgeOffsetFrames = settings.JudgeOffsetFrames;
    if (judgeOffsetFrames > 0) return FastAbsolutePos(judgeOffsetFrames);
    if (judgeOffsetFrames < 0) return SlowAbsolutePos(-judgeOffsetFrames);
    return raw;
}

float NoteManager.FastAbsolutePos(int frames)
{
    ClockCursor cursor = CurrentMusicCursor();
    repeat (frames)
        cursor.AdvanceSeconds(1.0f / 60.0f, BPMAt(cursor.AbsolutePos));
    return cursor.AbsolutePos;
}

float NoteManager.SlowAbsolutePos(int frames)
{
    ClockCursor cursor = CurrentMusicCursor();
    repeat (frames)
        cursor.AdvanceSeconds(-1.0f / 60.0f, BPMAt(cursor.AbsolutePos));
    return cursor.AbsolutePos;
}

float NoteUtility.GetNoteArrivalSeconds(float speed)
{
    return speed <= 11.01f
        ? (speed - 1.0f) * -0.5f + 5.5f
        : (speed - 11.0f) / -10.0f + 0.5f;
}
