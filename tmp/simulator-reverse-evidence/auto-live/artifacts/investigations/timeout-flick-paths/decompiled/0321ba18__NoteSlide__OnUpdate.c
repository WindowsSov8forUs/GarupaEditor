// corrected-entry: 0x321ba18
// corrected-end: 0x321bb1c
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteSlide__OnUpdate(_QWORD *a1, long double a2)
{
  __int64 v4; // x0
  int v5; // w20
  __int64 *v6; // x0
  __int64 v7; // x0
  __int64 v8; // x8
  __int64 v9; // x0
  long double v10; // q0

  if ( (byte_725225A & 1) == 0 )
  {
    ((void (__fastcall *)(void *))unk_2E10210)(&unk_6F27F78);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F27F80);
    byte_725225A = 1;
  }
  ((void (__fastcall *)(_QWORD *, _QWORD, long double))unk_3A7651C)(a1, 0, a2);
  NoteSlide__slidingMove((__int64)a1, a2);
  v4 = a1[55];
  if ( !v4 )
    goto LABEL_15;
  v5 = 0;
  while ( v5 < *(_DWORD *)(v4 + 24) )
  {
    v6 = (__int64 *)((__int64 (*)(void))unk_5768734)();
    if ( v6 )
    {
      NoteBase__ExecuteUpdate(v6, a2);
      v4 = a1[55];
      ++v5;
      if ( v4 )
        continue;
    }
    goto LABEL_15;
  }
  v7 = a1[42];
  if ( !v7 )
    goto LABEL_15;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v7, 0) & 1) != 0 )
  {
LABEL_13:
    NoteSlide__forcePerfectOnUpdate((__int64)a1);
    return;
  }
  v8 = a1[30];
  if ( v8 )
  {
    if ( (*(unsigned int (__fastcall **)(_QWORD, _QWORD))(v8 + 24))(*(_QWORD *)(v8 + 64), *(_QWORD *)(v8 + 40)) == 14 )
      goto LABEL_13;
  }
  else
  {
LABEL_15:
    v9 = ((__int64 (*)(void))unk_2E1049C)();
    NoteSlide__slidingMove(v9, v10);
  }
}
