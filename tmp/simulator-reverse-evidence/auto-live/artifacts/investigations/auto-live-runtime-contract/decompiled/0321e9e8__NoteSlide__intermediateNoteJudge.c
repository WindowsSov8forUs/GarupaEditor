// corrected-entry: 0x321e9e8
// corrected-end: 0x321ec6c
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteSlide__intermediateNoteJudge(_QWORD *a1, int a2, int a3)
{
  __int64 result; // x0
  __int64 v5; // x8
  int v6; // w9
  unsigned int v7; // w21
  __int64 v9; // x0
  unsigned int v10; // w22
  int v11; // w23
  long double v12; // q0
  float v13; // s8
  float v14; // s9
  float v15; // s0
  __int64 v16; // x8
  __int64 v17; // x26
  float v18; // s10
  float v19; // s11
  int v20; // w0
  __int64 v21; // x8
  int v22; // w25
  __int64 v23; // x0
  __int64 v24; // x8
  __int64 v25; // x8
  __int64 v26; // x24
  float v27; // s4
  float v28; // s0
  __int64 v29; // x9
  __int64 v30; // x8
  int v31; // [xsp+58h] [xbp-48h] BYREF
  int v32; // [xsp+5Ch] [xbp-44h] BYREF

  v31 = 0;
  result = a1[51];
  if ( !result )
    goto LABEL_21;
  v5 = *(_QWORD *)(result + 96);
  if ( !v5 )
    goto LABEL_21;
  if ( !*(_BYTE *)(v5 + 20) )
  {
    v6 = *(unsigned __int8 *)(v5 + 23);
    *(_BYTE *)(v5 + 20) = 1;
    if ( !v6 )
    {
      v7 = a2 & ~(a2 >> 31);
      v9 = ((__int64 (*)(void))unk_3A74AEC)();
      v10 = ((__int64 (__fastcall *)(_QWORD *, _QWORD, __int64, _QWORD))unk_30E0AE0)(a1, v7, v9, 0);
      v32 = 0;
      v11 = ((__int64 (__fastcall *)(_QWORD *, _QWORD, int *, _QWORD))unk_30E0954)(a1, v10, &v32, 0);
      ((void (__fastcall *)(_QWORD *, _QWORD, __int64, __int64))unk_321D178)(a1, v10, 8, 0xFFFFFFFFLL);
      if ( !byte_72517F1 )
      {
        ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF46D0);
        byte_72517F1 = 1;
      }
      ((void (__fastcall *)(_QWORD, _QWORD, _QWORD, float))unk_331F720)(
        a1[36],
        a1[42],
        0,
        *(float *)(*((_QWORD *)off_6EF46D0 + 23) + 8LL));
      v12 = ((long double (__fastcall *)(_QWORD *, _QWORD, _QWORD))unk_3A76DD8)(a1, v10, 0);
      v13 = *(float *)&v12;
      if ( !byte_72517F2 )
      {
        ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF46D0);
        byte_72517F2 = 1;
      }
      ((void (__fastcall *)(_QWORD, _QWORD, _QWORD, float))unk_331F720)(
        a1[36],
        a1[42],
        0,
        *(float *)(*((_QWORD *)off_6EF46D0 + 23) + 12LL));
      LODWORD(v14) = COERCE_UNSIGNED_INT128(((long double (__fastcall *)(_QWORD *, _QWORD, _QWORD))unk_3A76DD8)(a1, v10, 0));
      ((void (__fastcall *)(_QWORD *, _QWORD))unk_30E0B78)(a1, 0);
      v31 = 0;
      v16 = a1[51];
      if ( v16 )
      {
        v17 = *(_QWORD *)(v16 + 96);
        v18 = v15;
        LODWORD(v19) = COERCE_UNSIGNED_INT128(((long double (__fastcall *)(_QWORD *, _QWORD, int *, _QWORD))unk_30E0B94)(a1, v10, &v31, 0));
        v20 = ((__int64 (__fastcall *)(_QWORD *, _QWORD, _QWORD))unk_3A76DC8)(a1, v10, 0);
        v21 = a1[29];
        if ( v21 )
        {
          v22 = v20;
          v23 = (*(__int64 (__fastcall **)(_QWORD, _QWORD))(v21 + 24))(*(_QWORD *)(v21 + 64), *(_QWORD *)(v21 + 40));
          if ( v17 )
          {
            v24 = a1[44];
            if ( v24 )
            {
              v25 = *(_QWORD *)(v24 + 128);
              v26 = v23;
              if ( v25 )
              {
                v27 = *(float *)(v25 + 48);
                if ( !v23 )
                  goto LABEL_21;
              }
              else
              {
                v27 = 0.0;
                if ( !v23 )
                  goto LABEL_21;
              }
              v28 = OneFrameData__Setup(
                      v23,
                      *(_DWORD *)(v17 + 16),
                      *(_QWORD *)(v17 + 40),
                      v11,
                      v22,
                      8,
                      v7,
                      v10,
                      v13,
                      v14,
                      v18,
                      v19,
                      v27,
                      v31,
                      *(_DWORD *)(v17 + 88),
                      v32,
                      a3);
              v29 = a1[51];
              if ( v29 )
              {
                v30 = a1[28];
                if ( v30 )
                  return (*(__int64 (__fastcall **)(_QWORD, __int64, _QWORD, _QWORD, _QWORD, float))(v30 + 24))(
                           *(_QWORD *)(v30 + 64),
                           v26,
                           *(unsigned __int8 *)(v29 + 196),
                           0,
                           *(_QWORD *)(v30 + 40),
                           v28);
              }
            }
          }
        }
      }
LABEL_21:
      ((void (*)(void))unk_2E1049C)();
      JUMPOUT(0x321EC6C);
    }
  }
  return result;
}
