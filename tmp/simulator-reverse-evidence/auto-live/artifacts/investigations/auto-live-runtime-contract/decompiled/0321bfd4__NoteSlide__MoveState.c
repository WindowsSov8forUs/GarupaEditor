// corrected-entry: 0x321bfd4
// corrected-end: 0x321c1cc
// boundary-source: IL2CPP metadata RVA adjacency

void __fastcall NoteSlide__MoveState(
        __int64 a1,
        long double a2,
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
        __int64 a13)
{
  long double v13; // q9
  long double v14; // q10
  __int64 v17; // x0
  __int64 v18; // x1
  __int64 v19; // x2
  __int64 v20; // x3
  __int64 v21; // x4
  __int64 v22; // x5
  __int64 v23; // x6
  __int64 v24; // x7
  __int64 v25; // x8
  _QWORD *v26; // x0
  __int64 v27; // x0
  long double v28; // q1
  long double v29; // q8
  __int64 v30; // x8
  __int64 v31; // x20
  __int64 v32; // x8
  __int64 v33; // x0
  long double v34; // q2
  long double v35; // q10
  __int64 v36; // x0
  __int64 v37; // x20
  __int64 v38; // x0
  __int64 v39; // x0
  float v40; // s0
  float v41; // s1
  float v42; // s2

  if ( (byte_725225B & 1) == 0 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF2680);
    byte_725225B = 1;
  }
  ((void (__fastcall *)(__int64, _QWORD, long double))unk_30E058C)(a1, 0, a2);
  v17 = *(_QWORD *)(a1 + 336);
  if ( !v17 )
    goto LABEL_27;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v17, 0) & 1) != 0 )
  {
LABEL_7:
    v26 = (_QWORD *)a1;
LABEL_8:
    NoteSlide__forcePerfectMoveState(v26, v18, v19, v20, v21, v22, v23, v24, a10, a11, a12, a13);
    return;
  }
  v25 = *(_QWORD *)(a1 + 240);
  if ( !v25 )
    goto LABEL_27;
  if ( (*(unsigned int (__fastcall **)(_QWORD, _QWORD))(v25 + 24))(*(_QWORD *)(v25 + 64), *(_QWORD *)(v25 + 40)) == 14 )
    goto LABEL_7;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_3A7632C)(a1, 0) & 1) != 0 )
  {
    v27 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(a1, 0);
    if ( v27 )
    {
      ((void (__fastcall *)(__int64, _QWORD))unk_65C9610)(v27, 0);
      if ( *(_QWORD *)(a1 + 480) )
      {
        v29 = v28;
        if ( *(float *)&v28 > ((float (*)(void))unk_321B9BC)() )
          return;
        v30 = *(_QWORD *)(a1 + 408);
        if ( v30 )
        {
          v31 = *(_QWORD *)(v30 + 96);
          if ( v31 )
          {
            LODWORD(v13) = *(_DWORD *)(a1 + 132);
            LODWORD(v29) = *(_DWORD *)(a1 + 136);
            if ( *(_BYTE *)(v31 + 23) )
            {
              v32 = *(_QWORD *)(a1 + 272);
              if ( !v32 )
                goto LABEL_27;
              LODWORD(v14) = *(_DWORD *)(v32 + 20);
              if ( !*((_DWORD *)off_6EF2680 + 56) )
                ((void (*)(void))unk_2E10384)();
              v13 = ((long double (__fastcall *)(__int64, _QWORD, long double, long double))unk_377ECD4)(
                      v31,
                      0,
                      v14,
                      v13);
            }
            v33 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(a1, 0);
            if ( v33 )
            {
              ((void (__fastcall *)(__int64, _QWORD))unk_65C9610)(v33, 0);
              v35 = v34;
              v36 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(a1, 0);
              if ( v36 )
              {
                ((void (__fastcall *)(__int64, _QWORD, long double, long double, long double))unk_65C969C)(
                  v36,
                  0,
                  v13,
                  v29,
                  v35);
                v37 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(a1, 0);
                v38 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(a1, 0);
                if ( v38 )
                {
                  v39 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_65BB0E4)(v38, 0);
                  if ( v39 )
                  {
                    ((void (__fastcall *)(__int64, _QWORD))unk_65CAB9C)(v39, 0);
                    if ( v37 )
                    {
                      ((void (__fastcall *)(__int64, _QWORD, float, float, float))unk_65CAC3C)(
                        v37,
                        0,
                        v40 * *(float *)(a1 + 268),
                        v41 * *(float *)(a1 + 268),
                        v42 * *(float *)(a1 + 268));
                      NoteBase__ChangeState((_DWORD *)a1, 1);
                      return;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
LABEL_27:
    v26 = (_QWORD *)((__int64 (*)(void))unk_2E1049C)();
    goto LABEL_8;
  }
}
