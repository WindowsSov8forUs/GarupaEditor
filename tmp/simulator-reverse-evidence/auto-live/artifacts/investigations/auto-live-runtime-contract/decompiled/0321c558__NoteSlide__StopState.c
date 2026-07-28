// corrected-entry: 0x321c558
// corrected-end: 0x321c810
// boundary-source: IL2CPP metadata RVA adjacency

// local variable allocation has failed, the output may be wrong!
__int64 __fastcall NoteSlide__StopState(
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
        __int64 a12,
        __int128 a13,
        __int64 a14)
{
  __int64 *v14; // x22
  __int64 result; // x0
  __int64 v17; // x0
  __int64 v18; // x9
  __int64 v19; // x0
  __int64 v20; // x8
  float v21; // s8
  float v22; // s0
  float v23; // s8
  __int64 v24; // x8
  __int64 v25; // x0
  __int64 v26; // x20
  int v27; // w1
  __int64 v28; // x21
  __int64 v29; // x0
  _QWORD *v30; // x0

  if ( (byte_725225D & 1) == 0 )
  {
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F15F20);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F15F28);
    ((void (__fastcall *)(void *))unk_2E10210)(&unk_6F15F30);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F27F68);
    byte_725225D = 1;
  }
  a13 = 0u;
  a14 = 0;
  result = a1[55];
  if ( !result )
    goto LABEL_34;
  v14 = &qword_6F15F20;
  ((void (__fastcall *)(__int64 *__return_ptr, __int64, __int64))unk_576959C)(&a10, result, qword_6F27F68);
  a13 = *(_OWORD *)&a10;
  a14 = a12;
  while ( 1 )
  {
    v17 = ((__int64 (__fastcall *)(__int128 *, __int64))unk_52683E4)(&a13, qword_6F15F28);
    if ( (v17 & 1) == 0 )
      break;
    if ( !a14 )
    {
      v17 = ((__int64 (*)(void))unk_2E1049C)();
LABEL_31:
      v19 = ((__int64 (__fastcall *)(__int64))unk_2E1049C)(v17);
LABEL_32:
      v19 = ((__int64 (__fastcall *)(__int64))unk_2E1049C)(v19);
LABEL_33:
      result = ((__int64 (__fastcall *)(__int64))unk_2E1049C)(v19);
      goto LABEL_34;
    }
    v18 = *(_QWORD *)(a14 + 96);
    if ( !v18 )
      goto LABEL_31;
    if ( !*(_BYTE *)(v18 + 23) )
    {
      if ( !*(_DWORD *)(a14 + 476) )
        return ((__int64 (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, qword_6F15F20);
      break;
    }
  }
  ((void (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, qword_6F15F20);
  result = a1[55];
  if ( !result )
    goto LABEL_34;
  ((void (__fastcall *)(__int64 *__return_ptr, __int64, __int64))unk_576959C)(&a10, result, qword_6F27F68);
  a13 = *(_OWORD *)&a10;
  a14 = a12;
  while ( 1 )
  {
    v19 = ((__int64 (__fastcall *)(__int128 *, __int64))unk_52683E4)(&a13, qword_6F15F28);
    if ( (v19 & 1) == 0 )
      break;
    if ( !a14 )
      goto LABEL_32;
    v20 = *(_QWORD *)(a14 + 96);
    if ( !v20 )
      goto LABEL_33;
    if ( !*(_BYTE *)(v20 + 23) )
    {
      v21 = (float)*(int *)(v20 + 88);
      goto LABEL_18;
    }
  }
  v21 = 0.0;
LABEL_18:
  ((void (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, qword_6F15F20);
  while ( 1 )
  {
    result = a1[31];
    if ( result )
    {
      NoteManager__GetAdjustMusicPos((_QWORD *)result);
      result = a1[42];
      if ( result )
      {
        v23 = v22 - v21;
        result = ((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(result, 0);
        if ( (result & 1) != 0 )
        {
          if ( v23 < 0.0 )
            return result;
          return NoteSlide__forcePerfectStopState(a1);
        }
        v24 = a1[30];
        if ( v24 )
        {
          result = (*(__int64 (__fastcall **)(_QWORD, _QWORD))(v24 + 24))(*(_QWORD *)(v24 + 64), *(_QWORD *)(v24 + 40));
          if ( v23 < 0.0 || (_DWORD)result != 14 )
            return result;
          return NoteSlide__forcePerfectStopState(a1);
        }
      }
    }
LABEL_34:
    v25 = ((__int64 (__fastcall *)(__int64))unk_2E1049C)(result);
    v26 = v25;
    if ( v27 != 1 )
      break;
    v28 = *(_QWORD *)((__int64 (__fastcall *)(__int64))__cxa_begin_catch)(v25);
    ((void (*)(void))__cxa_end_catch)();
    ((void (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, *v14);
    v21 = 0.0;
    if ( v28 )
    {
      ((void (__fastcall *)(__int64))unk_2DF4574)(v28);
      ((void (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, *v14);
      goto LABEL_38;
    }
  }
  ((void (__fastcall *)(__int128 *, __int64))unk_52683E0)(&a13, *v14);
LABEL_38:
  ((void (__fastcall *)(__int64))unk_2EB97E4)(v26);
  v29 = ((__int64 (__fastcall *)(_QWORD))unk_2DF4574)(0);
  v30 = (_QWORD *)((__int64 (__fastcall *)(__int64))unk_2A59E18)(v29);
  return NoteSlide__forcePerfectStopState(v30);
}
