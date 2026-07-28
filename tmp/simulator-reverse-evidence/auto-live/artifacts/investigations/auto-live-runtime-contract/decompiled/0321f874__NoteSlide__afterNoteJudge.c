// corrected-entry: 0x321f874
// corrected-end: 0x321fb44
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteSlide__afterNoteJudge(__int64 a1, int a2, int a3)
{
  __int64 v4; // x0
  __int64 v5; // x8
  __int64 v6; // x8
  int v7; // w8
  unsigned int v9; // w21
  unsigned int v10; // w22
  __int64 v11; // x0
  unsigned int v12; // w23
  int v13; // w24
  unsigned int v14; // w0
  long double v15; // q0
  float v16; // s8
  float v17; // s9
  float v18; // s0
  __int64 v19; // x8
  __int64 v20; // x27
  float v21; // s10
  float v22; // s11
  int v23; // w0
  __int64 v24; // x8
  int v25; // w26
  __int64 v26; // x0
  __int64 v27; // x8
  __int64 v28; // x8
  __int64 v29; // x25
  float v30; // s4
  float v31; // s0
  __int64 v32; // x9
  __int64 v33; // x8
  __int64 v35; // x0
  _QWORD *v36; // x1
  __int64 v37; // x2
  int v38; // [xsp+28h] [xbp-78h] BYREF
  int v39; // [xsp+2Ch] [xbp-74h] BYREF

  v38 = 0;
  v4 = *(_QWORD *)(a1 + 408);
  if ( !v4 )
    goto LABEL_28;
  v5 = *(_QWORD *)(v4 + 96);
  if ( !v5 )
    goto LABEL_28;
  *(_BYTE *)(v5 + 20) = 1;
  v6 = *(_QWORD *)(a1 + 96);
  if ( !v6 )
    goto LABEL_28;
  v7 = *(_DWORD *)(v6 + 56);
  v9 = a2 & ~(a2 >> 31);
  if ( v7 == 8 )
  {
    v10 = 5;
  }
  else if ( (unsigned int)(v7 - 9) >= 2 )
  {
    if ( (unsigned int)(v7 - 11) > 1 )
    {
      v10 = 8;
      goto LABEL_12;
    }
    v10 = 7;
  }
  else
  {
    v10 = 6;
  }
  if ( !*(_BYTE *)(a1 + 576) )
    v9 = 0;
LABEL_12:
  v11 = ((__int64 (*)(void))unk_3A74AEC)();
  v12 = ((__int64 (__fastcall *)(__int64, _QWORD, __int64, _QWORD))unk_30E0AE0)(a1, v9, v11, 0);
  v39 = 0;
  v13 = ((__int64 (__fastcall *)(__int64, _QWORD, int *, _QWORD))unk_30E0954)(a1, v12, &v39, 0);
  v14 = ((__int64 (__fastcall *)(__int64))unk_321F0D4)(a1);
  ((void (__fastcall *)(__int64, _QWORD, _QWORD, _QWORD))unk_321D178)(a1, v12, v10, v14);
  if ( !byte_72517F1 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF46D0);
    byte_72517F1 = 1;
  }
  ((void (__fastcall *)(_QWORD, _QWORD, _QWORD, float))unk_331F720)(
    *(_QWORD *)(a1 + 288),
    *(_QWORD *)(a1 + 336),
    0,
    *(float *)(*((_QWORD *)off_6EF46D0 + 23) + 8LL));
  v15 = ((long double (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DD8)(a1, v12, 0);
  v16 = *(float *)&v15;
  if ( !byte_72517F2 )
  {
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6EF46D0);
    byte_72517F2 = 1;
  }
  ((void (__fastcall *)(_QWORD, _QWORD, _QWORD, float))unk_331F720)(
    *(_QWORD *)(a1 + 288),
    *(_QWORD *)(a1 + 336),
    0,
    *(float *)(*((_QWORD *)off_6EF46D0 + 23) + 12LL));
  LODWORD(v17) = COERCE_UNSIGNED_INT128(((long double (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DD8)(a1, v12, 0));
  ((void (__fastcall *)(__int64, _QWORD))unk_30E0B78)(a1, 0);
  v38 = 0;
  v19 = *(_QWORD *)(a1 + 408);
  if ( !v19 )
    goto LABEL_28;
  v20 = *(_QWORD *)(v19 + 96);
  v21 = v18;
  LODWORD(v22) = COERCE_UNSIGNED_INT128(((long double (__fastcall *)(__int64, _QWORD, int *, _QWORD))unk_30E0B94)(a1, v12, &v38, 0));
  v23 = ((__int64 (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DC8)(a1, v12, 0);
  v24 = *(_QWORD *)(a1 + 232);
  if ( !v24 )
    goto LABEL_28;
  v25 = v23;
  v26 = (*(__int64 (__fastcall **)(_QWORD, _QWORD))(v24 + 24))(*(_QWORD *)(v24 + 64), *(_QWORD *)(v24 + 40));
  if ( !v20 )
    goto LABEL_28;
  v27 = *(_QWORD *)(a1 + 352);
  if ( !v27 )
    goto LABEL_28;
  v28 = *(_QWORD *)(v27 + 128);
  v29 = v26;
  if ( v28 )
  {
    v30 = *(float *)(v28 + 48);
    if ( !v26 )
      goto LABEL_28;
  }
  else
  {
    v30 = 0.0;
    if ( !v26 )
      goto LABEL_28;
  }
  v31 = OneFrameData__Setup(
          v26,
          *(_DWORD *)(v20 + 16),
          *(_QWORD *)(v20 + 40),
          v13,
          v25,
          v10,
          v9,
          v12,
          v16,
          v17,
          v21,
          v22,
          v30,
          v38,
          *(_DWORD *)(v20 + 88),
          v39,
          a3);
  v32 = *(_QWORD *)(a1 + 408);
  if ( v32 )
  {
    v33 = *(_QWORD *)(a1 + 224);
    if ( v33 )
      return (*(__int64 (__fastcall **)(_QWORD, __int64, _QWORD, _QWORD, _QWORD, float))(v33 + 24))(
               *(_QWORD *)(v33 + 64),
               v29,
               *(unsigned __int8 *)(v32 + 196),
               *(unsigned int *)(a1 + 488),
               *(_QWORD *)(v33 + 40),
               v31);
  }
LABEL_28:
  v35 = ((__int64 (*)(void))unk_2E1049C)();
  return NoteSlide__onMiss(v35, v36, v37);
}
