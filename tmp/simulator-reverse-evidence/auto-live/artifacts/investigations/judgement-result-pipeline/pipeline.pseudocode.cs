enum NoteResultType { None = -1, Miss = 0, Bad = 1, Good = 2, Great = 3, Perfect = 4 }
enum JudgeTiming { None = 0, Fast = 1, Slow = 2 }

NoteResultType GetResult(float diffSecond, int sweetFrame)
{
    int frame = RoundToNearestFrame(diffSecond, 60.0f);
    if (frame < sweetFrame + 3) return NoteResultType.Perfect;
    if (frame < sweetFrame + 6) return NoteResultType.Great;
    if (frame < sweetFrame + 7) return NoteResultType.Good;
    if (frame < sweetFrame + 8) return NoteResultType.Bad;
    return NoteResultType.None;
}

NoteResultType JudgeNote(float noteJudgePos, float currentPos, float bpm,
                         out JudgeTiming timing, int sweetFrame = 0)
{
    float diffSecond = GetSecWithDistance(Abs(noteJudgePos - currentPos), bpm);
    NoteResultType result = GetResult(diffSecond, sweetFrame);
    timing = result == NoteResultType.Perfect
        ? JudgeTiming.None
        : noteJudgePos - currentPos <= 0 ? JudgeTiming.Slow : JudgeTiming.Fast;
    return result;
}

NoteResultType CalcNoteResultType(NoteFrontBase target, SlideNoteManager slide,
                                  InGameMusicScoreController score, NoteManager notes,
                                  out JudgeTiming timing)
{
    if (target is NoteSlide slideNote) {
        NoteResultType result = slide.Judge(slideNote.CurrentNote.VirtualPosY, out int cursor);
        timing = result != NoteResultType.Perfect && cursor > 0
            ? JudgeTiming.Fast : JudgeTiming.None;
        return result;
    }
    return JudgeNote(target.InfoData.AbsolutePos, notes.GetAdjustMusicPos(),
                     score.CurrentBPM, out timing);
}

void JudgeFrontNote(NoteFrontBase note, NoteResultType rawResult, int judgeNoteType,
                    ButtonType[] buttons, GamePlayButton effectButton, JudgeTiming timing)
{
    NoteResultType adjustedResult = note.getNoteResultType(rawResult, note.TargetCenterButton);
    int addCombo = adjustedResult >= NoteResultType.Great ? 1 : -1;
    int addPower = note.calcAddDamage(adjustedResult, out int damageGuardType);
    float addScore = note.calcBaseCorrectedScore(adjustedResult);
    float freeLiveBonusScore = note.calcBaseCorrectedScore(adjustedResult);
    float feverRate = note.FeverTimeManager.GetFeverTimeScoreRate();
    float skillRate = note.calcSkillScoreUpRate(adjustedResult, out int scoreUpType);
    float crescendoRate = note.SituationSkillManager.CrescendoSkillScoreUpRate;

    OneFrameData frame = note.OneFrameDataProvider.GetUsableOneFrameData();
    frame.Setup(note.InfoData.Index, buttons, addScore, freeLiveBonusScore,
                addPower, addCombo, judgeNoteType, rawResult, adjustedResult,
                feverRate, skillRate, crescendoRate, scoreUpType,
                note.InfoData.AbsolutePos, damageGuardType, timing);
    note.OnJudgeNote(frame, note.IsSync, note.MultipleDirectionalFlickNoteCount);
    note.onFinishJudgeFrontNote(adjustedResult);
}

void OneFrameData.Setup(int index, ButtonType[] buttons, float addScore,
                        float freeLiveBonusScore, int addPower, int addCombo,
                        int noteType, NoteResultType result, NoteResultType adjustedResult,
                        float feverRate, float skillRate, float crescendoRate,
                        int scoreUpType, int absolutePos, int damageGuardType,
                        JudgeTiming timing)
{
    IsUse = true;
    // Direct assignments to offsets 0x14 through 0x4C are omitted here.
    JudgeTiming = adjustedResult is NoteResultType.Miss or NoteResultType.Perfect
        ? JudgeTiming.None : timing;
    ScoreUpRate = feverRate * skillRate;
}
