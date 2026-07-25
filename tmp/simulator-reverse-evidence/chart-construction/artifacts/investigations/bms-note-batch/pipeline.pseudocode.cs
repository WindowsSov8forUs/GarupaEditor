// Implementation-oriented pseudocode reconstructed from IL2CPP metadata and ARM64.
// It is evidence, not claimed original source.

List<NoteBatchInformation> CreateNoteBatchInformationList(string bms, bool isCommand)
{
    bmsBuilder.Initialize(isCommand);

    string[] lines = bms.Split('\n');
    if (!isCommand)
        lines = MusicScoreBezierConverter.Convert(lines) ?? lines;

    foreach (string line in lines)
        bmsBuilder.ExcuteParseLineForNoteDataManager(line, musicStringDictionary);

    var batches = new List<NoteBatchInformation>();
    convertResultDictionary(batches, isCommand);
    batches.Sort();

    if (bmsBuilder.IsMultiRangeNotes && !isCommand)
        combiningDictionary(batches);

    excuteNecessaryEndTimeAndSynchronizedNoteConduct(batches);
    setupMultipleDirectionalFlickNote(batches);

    musicStringDictionary.Clear();
    bmsBuilder.ResultDictionary.Clear();
    return batches;
}

void combiningDictionary(List<NoteBatchInformation> batches)
{
    foreach (NoteBatchInformation batch in batches)
    {
        List<NoteInformation> notes = batch.informationList_;
        NoteInformation previous = null;
        int runStart = 0;
        int previousIndex = -1;
        GameNoteType runType = GameNoteType.None;

        for (int index = 0; index < notes.Count; index++)
        {
            NoteInformation current = notes[index];
            bool excludedType = (uint)(current.GameNoteType - GameNoteType.SlideA) < 22;

            if (excludedType)
            {
                if (runType != GameNoteType.None)
                    combineNotes(notes, runStart, previousIndex);
                previous = null;
                runStart = 0;
                runType = GameNoteType.None;
                previousIndex = index;
                continue;
            }

            bool ignoredLongPlaceholder =
                current.GameNoteType == GameNoteType.Long && current.buttonType_ == (ButtonType)(-1);
            if (ignoredLongPlaceholder)
            {
                previousIndex = index;
                continue;
            }

            bool continues = previous != null
                && current.GameNoteType == runType
                && current.buttonType_ == previous.buttonType_ + 1;

            if (!continues)
            {
                if (runType != GameNoteType.None)
                    combineNotes(notes, runStart, previousIndex);
                runStart = index;
                runType = current.GameNoteType;
            }

            previous = current;
            if (index == notes.Count - 1)
                combineNotes(notes, runStart, index);
            previousIndex = index;
        }
    }
}

void combineNotes(List<NoteInformation> notes, int startIndex, int endIndex)
{
    NoteInformation first = notes[startIndex];
    NoteInformation last = notes[endIndex];
    ButtonType centerButton = (ButtonType)(((int)first.buttonType_ + (int)last.buttonType_) / 2);

    NoteInformation combined = notes.FirstOrDefault(x => x.buttonType_ == centerButton);
    if (combined == null)
        return;

    for (int i = startIndex; i <= endIndex; i++)
    {
        NoteInformation source = notes[i];
        if (source.buttonType_ != centerButton)
        {
            combined.AppendButtonType(source.buttonType_);
            if (source.VirtualLaneDirection != 0)
                combined.VirtualLaneDirection = source.VirtualLaneDirection;
            if (source.VirtualLaneDistance != 0)
                combined.VirtualLaneDistance = source.VirtualLaneDistance;
            MergeNestedSoundValues(combined, source);
        }
        source.IsMultiRangeCombine = true;
    }

    combined.BakeButtonTypes();
}
