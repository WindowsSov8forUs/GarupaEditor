// corrected-entry: 0x321c1cc
// corrected-end: 0x321c2d0
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteSlide__forcePerfectMoveState(
        _QWORD *a1,
        __int64 a2,
        __int64 a3,
        __int64 a4,
        __int64 a5,
        __int64 a6,
        __int64 a7,
        __int64 a8,
        __int64 a9,
        __int64 a10,
        __int64 a11,
        __int64 a12)
{
  _QWORD *v13; // x0
  float v14; // s0
  __int64 v15; // x8
  float **v16; // x0
  __int64 v17; // x0
  __int64 v18; // x0
  __int64 v19; // x0
  _QWORD *v20; // x0
  __int64 v21; // x1
  __int64 v22; // x2
  __int64 v23; // x3
  __int64 v24; // x4
  __int64 v25; // x5
  __int64 v26; // x6
  __int64 v27; // x7

  if ( (byte_7252279 & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EEAD48);
    byte_7252279 = 1;
  }
  v13 = (_QWORD *)a1[31];
  if ( v13 )
  {
    NoteManager__GetAdjustMusicPos(v13);
    v15 = a1[12];
    if ( v15 )
    {
      if ( (float)(v14 - (float)*(int *)(v15 + 88)) < 0.0 )
        return;
      NoteBase__ChangeState(a1, 1);
      v16 = (float **)off_6EEAD48;
      if ( !*((_DWORD *)off_6EEAD48 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v16 = (float **)off_6EEAD48;
      }
      (*(void (__fastcall **)(_QWORD *, __int64, _QWORD, _QWORD, float, float))(*a1 + 616LL))(
        a1,
        4,
        0,
        *(_QWORD *)(*a1 + 624LL),
        *v16[23],
        v16[23][1]);
      ((void (__fastcall *)(_QWORD *, _QWORD))unk_30E14AC)(a1, 0);
      v17 = a1[51];
      if ( v17 )
      {
        v18 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(v17, 0);
        if ( v18 )
        {
          ((void (__fastcall *)(__int64, _QWORD))unk_387D890)(v18, 0);
          v19 = a1[51];
          if ( v19 )
          {
            if ( ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(v19, 0) )
              JUMPOUT(0x387D940);
          }
        }
      }
    }
  }
  v20 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
  NoteSlide__WaitState(v20, v21, v22, v23, v24, v25, v26, v27, a9, a10, a11, a12);
}
