// corrected-entry: 0x321bd94
// corrected-end: 0x321bfd4
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteSlide__forcePerfectOnUpdate(__int64 a1)
{
  __int64 v2; // x20
  __int64 v3; // x8
  __int64 v4; // x20
  _QWORD *v5; // x0
  float v6; // s0
  __int64 v7; // x0
  __int64 v8; // x0
  __int64 v9; // x21
  __int64 v10; // x20
  long double v11; // q8
  long double v12; // q1
  long double v13; // q9
  _BOOL8 isIntermediateNote; // x0
  float **v15; // x0
  _QWORD *v16; // x20
  __int64 v17; // x10
  int v18; // w21
  float **v19; // x0
  __int64 v20; // x0
  long double v21; // q0

  if ( (byte_7252278 & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EEAD48);
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF2678);
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF2798);
    byte_7252278 = 1;
  }
  v2 = *(_QWORD *)(a1 + 408);
  if ( !*((_DWORD *)off_6EF2798 + 56) )
    ((void (*)(void))unk_2E10384)();
  if ( (((__int64 (__fastcall *)(__int64, _QWORD, _QWORD))unk_65BE9CC)(v2, 0, 0) & 1) == 0 )
  {
    v3 = *(_QWORD *)(a1 + 408);
    if ( !v3 )
      goto LABEL_27;
    v4 = *(_QWORD *)(v3 + 96);
    if ( !v4 || *(_BYTE *)(v4 + 21) )
      return;
    v5 = *(_QWORD **)(a1 + 248);
    if ( !v5 )
      goto LABEL_27;
    NoteManager__GetAdjustMusicPos(v5);
    if ( (float)(v6 - (float)*(int *)(v4 + 88)) < 0.0 )
      return;
    v7 = *(_QWORD *)(a1 + 408);
    if ( !v7
      || (v8 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(v7, 0)) == 0
      || (v9 = *(_QWORD *)(a1 + 328), v10 = v8, ((void (__fastcall *)(__int64, _QWORD))unk_387D324)(v8, 0), !v9) )
    {
LABEL_27:
      v20 = ((__int64 (*)(void))unk_2E1049C)();
      NoteSlide__MoveState(v20, v21);
      return;
    }
    v11 = ((long double (__fastcall *)(__int64, _QWORD))unk_657E4BC)(v9, 0);
    v13 = v12;
    isIntermediateNote = NoteSlide__isIntermediateNote(a1);
    if ( isIntermediateNote )
    {
      v15 = (float **)off_6EEAD48;
      if ( !*((_DWORD *)off_6EEAD48 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v15 = (float **)off_6EEAD48;
      }
      (*(void (__fastcall **)(__int64, __int64, __int64, _QWORD, float, float, long double, long double))(*(_QWORD *)a1 + 632LL))(
        a1,
        4,
        v10,
        *(_QWORD *)(*(_QWORD *)a1 + 640LL),
        *v15[23],
        v15[23][1],
        v11,
        v13);
    }
    else if ( (sub_321D084(isIntermediateNote) & 1) != 0 )
    {
      v16 = *(_QWORD **)(a1 + 408);
      if ( v16 )
      {
        v17 = *((unsigned __int8 *)off_6EF2678 + 304);
        if ( *(unsigned __int8 *)(*v16 + 304LL) >= (unsigned int)v17
          && *(_UNKNOWN **)(*(_QWORD *)(*v16 + 200LL) + 8 * v17 - 8) == off_6EF2678 )
        {
          v18 = ((__int64 (__fastcall *)(_QWORD, _QWORD))unk_3223A4C)(*(_QWORD *)(a1 + 408), v16[63]);
          *(_DWORD *)(a1 + 488) = v18 + ((__int64 (__fastcall *)(_QWORD *, _QWORD))unk_3223B44)(v16, v16[62]) + 1;
          (*(void (__fastcall **)(_QWORD *, _QWORD))(*v16 + 648LL))(v16, *(_QWORD *)(*v16 + 656LL));
        }
      }
      v19 = (float **)off_6EEAD48;
      if ( !*((_DWORD *)off_6EEAD48 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v19 = (float **)off_6EEAD48;
      }
      (*(void (__fastcall **)(__int64, __int64, _QWORD, _QWORD, float, float, long double, long double))(*(_QWORD *)a1 + 648LL))(
        a1,
        4,
        0,
        *(_QWORD *)(*(_QWORD *)a1 + 656LL),
        *v19[23],
        v19[23][1],
        v11,
        v13);
    }
  }
}
