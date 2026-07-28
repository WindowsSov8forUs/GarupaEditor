// corrected-entry: 0x30eb6b0
// corrected-end: 0x30eb7a0
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteLong__OnUpdate(_QWORD *a1, long double a2)
{
  __int64 *v4; // x0
  __int64 v5; // x0
  __int64 v6; // x0
  __int64 v7; // x0
  float v8; // s1
  float v9; // s8
  __int64 v10; // x0
  __int64 v11; // x0
  float v12; // s1
  __int64 v13; // x0
  __int64 v14; // x0
  __int64 v15; // x8
  __int64 result; // x0
  _QWORD *v17; // x0

  ((void (__fastcall *)(_QWORD *, _QWORD))unk_3A7651C)(a1, 0);
  v4 = (__int64 *)a1[54];
  if ( !v4 )
    goto LABEL_18;
  NoteBase__ExecuteUpdate(v4, a2);
  v5 = a1[54];
  if ( !v5 )
    goto LABEL_18;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74A30)(v5, 0) & 1) != 0 )
  {
    v6 = a1[54];
    if ( !v6 )
      goto LABEL_18;
    v7 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(v6, 0);
    if ( !v7 )
      goto LABEL_18;
    ((void (__fastcall *)(__int64, _QWORD))unk_65C9610)(v7, 0);
    v9 = v8;
    v10 = ((__int64 (__fastcall *)(_QWORD *, _QWORD))unk_3A74AEC)(a1, 0);
    if ( !v10 )
      goto LABEL_18;
    v11 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(v10, 0);
    if ( !v11 )
      goto LABEL_18;
    ((void (__fastcall *)(__int64, _QWORD))unk_65C9610)(v11, 0);
    if ( v9 <= v12 )
    {
      v13 = a1[54];
      if ( !v13 )
        goto LABEL_18;
      ((void (__fastcall *)(__int64, _QWORD))unk_3A75E44)(v13, 0);
    }
  }
  v14 = a1[42];
  if ( !v14 )
    goto LABEL_18;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v14, 0) & 1) != 0 )
  {
LABEL_15:
    v17 = a1;
    return NoteLong__forcePerfectOnUpdate((__int64)v17);
  }
  v15 = a1[30];
  if ( !v15 )
  {
LABEL_18:
    v17 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
    return NoteLong__forcePerfectOnUpdate((__int64)v17);
  }
  result = (*(__int64 (__fastcall **)(_QWORD, _QWORD))(v15 + 24))(*(_QWORD *)(v15 + 64), *(_QWORD *)(v15 + 40));
  if ( (_DWORD)result == 14 )
    goto LABEL_15;
  return result;
}
