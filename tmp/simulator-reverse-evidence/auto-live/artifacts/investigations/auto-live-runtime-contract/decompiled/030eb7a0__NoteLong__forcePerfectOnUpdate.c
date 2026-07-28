// corrected-entry: 0x30eb7a0
// corrected-end: 0x30eb8fc
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteLong__forcePerfectOnUpdate(__int64 a1)
{
  _QWORD *v2; // x0
  float v3; // s0
  __int64 v4; // x8
  _QWORD *v5; // x20
  int v6; // w22
  float v7; // s8
  __int64 v8; // x10
  int v9; // w21
  __int64 v10; // x0
  long double v11; // q0
  long double v12; // q1
  _QWORD *v13; // x0
  __int64 v14; // x8
  _QWORD *v15; // x0

  if ( (byte_72517BE & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EEAD48);
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF2648);
    byte_72517BE = 1;
  }
  v2 = *(_QWORD **)(a1 + 248);
  if ( !v2 )
    goto LABEL_15;
  NoteManager__GetAdjustMusicPos(v2);
  v4 = *(_QWORD *)(a1 + 96);
  if ( !v4 )
    goto LABEL_15;
  v5 = *(_QWORD **)(a1 + 432);
  v6 = *(_DWORD *)(v4 + 92);
  v7 = v3;
  if ( v5 )
  {
    v8 = *((unsigned __int8 *)off_6EF2648 + 304);
    if ( *(unsigned __int8 *)(*v5 + 304LL) >= (unsigned int)v8
      && *(_UNKNOWN **)(*(_QWORD *)(*v5 + 200LL) + 8 * v8 - 8) == off_6EF2648 )
    {
      v9 = ((__int64 (__fastcall *)(_QWORD, _QWORD))unk_30EECB4)(*(_QWORD *)(a1 + 432), v5[54]);
      *(_DWORD *)(a1 + 444) = v9 + ((__int64 (__fastcall *)(_QWORD *, _QWORD))unk_30EEDAC)(v5, v5[53]) + 1;
    }
  }
  if ( (float)(v7 - (float)v6) > 0.0 )
  {
    v10 = *(_QWORD *)(a1 + 432);
    if ( v10 )
    {
      (*(void (__fastcall **)(__int64, _QWORD))(*(_QWORD *)v10 + 648LL))(v10, *(_QWORD *)(*(_QWORD *)v10 + 656LL));
      v13 = off_6EEAD48;
      if ( !*((_DWORD *)off_6EEAD48 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v13 = off_6EEAD48;
      }
      v14 = v13[23];
      LODWORD(v11) = *(_DWORD *)v14;
      LODWORD(v12) = *(_DWORD *)(v14 + 4);
      (*(void (__fastcall **)(__int64, __int64, _QWORD, _QWORD, float, float, long double, long double))(*(_QWORD *)a1 + 648LL))(
        a1,
        4,
        0,
        *(_QWORD *)(*(_QWORD *)a1 + 656LL),
        *(float *)v14,
        *(float *)&v12,
        v11,
        v12);
      return;
    }
LABEL_15:
    v15 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
    NoteLong__MoveState(v15);
  }
}
