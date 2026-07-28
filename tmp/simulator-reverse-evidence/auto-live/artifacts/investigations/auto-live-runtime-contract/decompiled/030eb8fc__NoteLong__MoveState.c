// corrected-entry: 0x30eb8fc
// corrected-end: 0x30eb97c
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteLong__MoveState(_QWORD *a1)
{
  __int64 v2; // x0
  __int64 v3; // x8
  _QWORD *v4; // x0

  ((void (__fastcall *)(_QWORD *, _QWORD))unk_3A74C0C)(a1, 0);
  v2 = a1[42];
  if ( !v2 )
    goto LABEL_10;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v2, 0) & 1) != 0 )
  {
LABEL_5:
    v4 = a1;
LABEL_6:
    NoteLong__forcePerfectMoveState(v4);
    return;
  }
  v3 = a1[30];
  if ( !v3 )
  {
LABEL_10:
    v4 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
    goto LABEL_6;
  }
  if ( (*(unsigned int (__fastcall **)(_QWORD, _QWORD))(v3 + 24))(*(_QWORD *)(v3 + 64), *(_QWORD *)(v3 + 40)) == 14 )
    goto LABEL_5;
  if ( (((__int64 (__fastcall *)(_QWORD *, _QWORD))unk_3A7632C)(a1, 0) & 1) != 0 )
    NoteBase__ChangeState(a1, 1);
}
