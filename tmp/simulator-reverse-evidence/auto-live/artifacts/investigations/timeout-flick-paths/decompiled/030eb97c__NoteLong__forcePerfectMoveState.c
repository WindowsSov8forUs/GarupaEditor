// corrected-entry: 0x30eb97c
// corrected-end: 0x30eba44
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteLong__forcePerfectMoveState(_QWORD *a1)
{
  _QWORD *v2; // x0
  float v3; // s0
  __int64 v4; // x8
  float **v5; // x0
  __int64 v6; // x0
  long double v7; // q0

  if ( (byte_72517BF & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EEAD48);
    byte_72517BF = 1;
  }
  v2 = (_QWORD *)a1[31];
  if ( v2 && (NoteManager__GetAdjustMusicPos(v2), (v4 = a1[12]) != 0) )
  {
    if ( (float)(v3 - (float)*(int *)(v4 + 88)) >= 0.0 )
    {
      NoteBase__ChangeState(a1, 1);
      v5 = (float **)off_6EEAD48;
      if ( !*((_DWORD *)off_6EEAD48 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v5 = (float **)off_6EEAD48;
      }
      (*(void (__fastcall **)(_QWORD *, __int64, _QWORD, _QWORD, float, float))(*a1 + 616LL))(
        a1,
        4,
        0,
        *(_QWORD *)(*a1 + 624LL),
        *v5[23],
        v5[23][1]);
      JUMPOUT(0x30E14AC);
    }
  }
  else
  {
    v6 = ((__int64 (*)(void))unk_2E1049C)();
    NoteLong__WaitState(v6, v7);
  }
}
