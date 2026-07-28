// corrected-entry: 0x30eb680
// corrected-end: 0x30eb6b0
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteLong__ExecuteAfterUpdate(__int64 a1)
{
  __int64 v2; // x0
  _QWORD *v4; // x0
  long double v5; // q0

  NoteBase__ExecuteAfterUpdate(a1);
  v2 = *(_QWORD *)(a1 + 432);
  if ( v2 )
    return (*(__int64 (__fastcall **)(__int64, _QWORD))(*(_QWORD *)v2 + 536LL))(v2, *(_QWORD *)(*(_QWORD *)v2 + 544LL));
  v4 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
  return NoteLong__OnUpdate(v4, v5);
}
