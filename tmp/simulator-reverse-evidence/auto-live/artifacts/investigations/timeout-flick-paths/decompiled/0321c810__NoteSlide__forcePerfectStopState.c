// corrected-entry: 0x321c810
// corrected-end: 0x321c948
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteSlide__forcePerfectStopState(_QWORD *a1)
{
  long double v1; // q10
  long double v2; // q11
  __int64 v4; // x20
  __int64 result; // x0
  __int64 v6; // x0
  __int64 v7; // x20
  __int64 v8; // x0
  long double v9; // q8
  long double v10; // q1
  long double v11; // q9
  _QWORD *v12; // x0
  _DWORD *v13; // x9
  __int64 v14; // x2
  __int64 v15; // x0
  unsigned int v16; // w1
  int v17; // w2
  float v18; // s0
  float v19; // s1

  if ( (byte_725227A & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EEAD48);
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF2798);
    byte_725227A = 1;
  }
  v4 = a1[52];
  if ( !*((_DWORD *)off_6EF2798 + 56) )
    ((void (*)(void))unk_2E10384)();
  result = ((__int64 (__fastcall *)(__int64, _QWORD, _QWORD))unk_65BDAE8)(v4, 0, 0);
  if ( (result & 1) != 0 )
  {
    v6 = a1[52];
    if ( !v6 )
      goto LABEL_14;
    v7 = a1[41];
    v8 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(v6, 0);
    if ( !v8 )
      goto LABEL_14;
    ((void (__fastcall *)(__int64, _QWORD))unk_387D324)(v8, 0);
    if ( !v7 )
      goto LABEL_14;
    v9 = ((long double (__fastcall *)(__int64, _QWORD))unk_657E4BC)(v7, 0);
    v11 = v10;
    v12 = off_6EEAD48;
    if ( !*((_DWORD *)off_6EEAD48 + 56) )
    {
      ((void (*)(void))unk_2E10384)();
      v12 = off_6EEAD48;
    }
    if ( a1[52] )
    {
      v13 = (_DWORD *)v12[23];
      LODWORD(v2) = *v13;
      LODWORD(v1) = v13[1];
      v14 = ((__int64 (__fastcall *)(_QWORD, _QWORD))unk_3A74AEC)(a1[52], 0);
      return (*(__int64 (__fastcall **)(_QWORD *, __int64, __int64, _QWORD, long double, long double, long double, long double))(*a1 + 632LL))(
               a1,
               4,
               v14,
               *(_QWORD *)(*a1 + 640LL),
               v2,
               v1,
               v9,
               v11);
    }
    else
    {
LABEL_14:
      v15 = ((__int64 (*)(void))unk_2E1049C)();
      return NoteSlide__ExecTouchBegan(v15, v16, v17, v18, v19);
    }
  }
  return result;
}
