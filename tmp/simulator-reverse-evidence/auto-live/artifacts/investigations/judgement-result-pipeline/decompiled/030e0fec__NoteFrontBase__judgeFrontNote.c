// corrected-entry: 0x30e0fec
// corrected-end: 0x30e14ac
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteFrontBase__judgeFrontNote(
        __int64 a1,
        unsigned int a2,
        unsigned int a3,
        __int64 a4,
        __int64 a5,
        int a6,
        __int64 a7,
        __int64 a8,
        __int64 a9,
        __int64 a10,
        __int64 a11,
        __int64 a12,
        __int64 a13,
        __int64 a14,
        __int64 a15,
        __int64 a16)
{
  __int64 v21; // x0
  unsigned int v22; // w23
  int v23; // w24
  int v24; // w25
  long double v25; // q0
  float v26; // s8
  float v27; // s0
  __int64 v28; // x0
  float v29; // s9
  long double v30; // q0
  __int64 v31; // x29
  float v32; // s10
  float v33; // s0
  unsigned int v34; // w28
  int v35; // w26
  float v36; // s11
  unsigned int v37; // w0
  __int64 v38; // x8
  __int64 v39; // x0
  __int64 v40; // x8
  __int64 v41; // x9
  unsigned int v42; // w27
  __int64 v43; // x8
  __int64 v44; // x0
  __int64 v45; // x0
  __int64 v46; // x0
  __int64 v47; // x0
  __int64 v48; // x27
  _QWORD *v49; // x0
  __int64 v50; // x27
  __int64 v51; // x28
  __int64 v52; // x0
  __int64 v53; // x0
  __int64 v54; // x8
  __int64 v55; // x0
  __int64 v56; // x8
  __int64 v57; // x8
  __int64 v58; // x26
  float v59; // s4
  float v60; // s0
  __int64 v61; // x20
  int v62; // w21
  unsigned int v63; // w0
  int v66; // [xsp+38h] [xbp-88h] BYREF
  int v67; // [xsp+3Ch] [xbp-84h] BYREF

  if ( (byte_725175F & 1) == 0 )
  {
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F42350);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F434B8);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6EDD718);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F32D20);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F6A848);
    ((void (__fastcall *)(_UNKNOWN **))unk_2E10210)(&off_6F00DF8);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F8A088);
    byte_725175F = 1;
  }
  v21 = ((__int64 (__fastcall *)(__int64, _QWORD))unk_3A74AEC)(a1, 0);
  v22 = ((__int64 (__fastcall *)(__int64, _QWORD, __int64))unk_30E0AE0)(v21, a2, v21);
  v23 = ((__int64 (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DC8)(a1, v22, 0);
  v67 = 0;
  v24 = ((__int64 (__fastcall *)(__int64, _QWORD, int *))unk_30E0954)(a1, v22, &v67);
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
  v25 = ((long double (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DD8)(a1, v22, 0);
  v26 = *(float *)&v25;
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
  ((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_3A76DD8)(a1, v22, 0);
  v28 = *(_QWORD *)(a1 + 344);
  if ( !v28 )
    goto LABEL_42;
  v29 = v27;
  v30 = ((long double (__fastcall *)(__int64, _QWORD))unk_32F4AB4)(v28, 0);
  v66 = 0;
  v31 = *(_QWORD *)(a1 + 96);
  v32 = *(float *)&v30;
  ((void (__fastcall *)(__int64, _QWORD, int *))unk_30E0B94)(a1, v22, &v66);
  if ( !v31 )
    goto LABEL_42;
  v34 = *(_DWORD *)(v31 + 48);
  v35 = *(unsigned __int8 *)(a1 + 85);
  v36 = v33;
  v37 = (*(__int64 (__fastcall **)(__int64, _QWORD))(*(_QWORD *)a1 + 680LL))(a1, *(_QWORD *)(*(_QWORD *)a1 + 688LL));
  v38 = *(_QWORD *)(v31 + 40);
  if ( !v38 )
    goto LABEL_42;
  if ( !a5 )
    goto LABEL_42;
  ((void (__fastcall *)(__int64, _QWORD, _QWORD, _QWORD, bool, _QWORD, _QWORD, _QWORD))unk_387D94C)(
    a5,
    v22,
    a3,
    v34,
    v35 != 0,
    v37,
    *(unsigned int *)(v38 + 24),
    0);
  v39 = *(_QWORD *)(a1 + 336);
  if ( !v39 )
    goto LABEL_42;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v39, 0) & 1) != 0 )
  {
    ((void (__fastcall *)(__int64, _QWORD))unk_387D890)(a5, 0);
    ((void (__fastcall *)(__int64, _QWORD))unk_387D940)(a5, 0);
  }
  if ( *(_BYTE *)(a1 + 85) )
  {
    ((void (__fastcall *)(__int64, _QWORD))unk_3A760C0)(a1, 0);
    if ( v22 - 3 > 1 )
    {
      v46 = *(_QWORD *)(a1 + 352);
      if ( !v46 )
        goto LABEL_42;
      ((void (__fastcall *)(__int64, _QWORD))unk_3322B84)(v46, 0);
    }
    else
    {
      v40 = *(_QWORD *)(a1 + 96);
      if ( !v40 )
        goto LABEL_42;
      v41 = *(_QWORD *)(a1 + 240);
      if ( !v41 )
        goto LABEL_42;
      v42 = *(_DWORD *)(v40 + 144);
      if ( (*(unsigned int (__fastcall **)(_QWORD, _QWORD))(v41 + 24))(*(_QWORD *)(v41 + 64), *(_QWORD *)(v41 + 40)) != 14 )
      {
        v43 = *(_QWORD *)(a1 + 96);
        if ( !v43 )
          goto LABEL_42;
        v44 = *(_QWORD *)(a1 + 352);
        if ( !v44 )
          goto LABEL_42;
        ((void (__fastcall *)(__int64, _QWORD, _QWORD, _QWORD))unk_3322BC4)(v44, v42, *(unsigned int *)(v43 + 88), 0);
        v45 = ((__int64 (__fastcall *)(__int64))unk_497C258)(qword_6F32D20);
        if ( !v45 )
          goto LABEL_42;
        ((void (__fastcall *)(__int64, __int64, _QWORD, float))unk_32C1568)(v45, qword_6F8A088, 0, 0.0);
      }
    }
  }
  v47 = *(_QWORD *)(a1 + 336);
  if ( !v47 )
    goto LABEL_42;
  v48 = *(_QWORD *)(a1 + 176);
  if ( (((__int64 (__fastcall *)(__int64, _QWORD))unk_32F1E68)(v47, 0) & 1) != 0 )
  {
    v49 = off_6F00DF8;
    if ( !*((_DWORD *)off_6F00DF8 + 56) )
    {
      ((void (*)(void))unk_2E10384)();
      v49 = off_6F00DF8;
    }
    v50 = *(_QWORD *)(v49[23] + 8LL);
    if ( !v50 )
    {
      if ( !*((_DWORD *)v49 + 56) )
      {
        ((void (*)(void))unk_2E10384)();
        v49 = off_6F00DF8;
      }
      v51 = *(_QWORD *)v49[23];
      v50 = ((__int64 (__fastcall *)(__int64))unk_2E10498)(qword_6EDD718);
      ((void (__fastcall *)(__int64, __int64, __int64, _QWORD))unk_54FD2F0)(v50, v51, qword_6F6A848, 0);
      v52 = *((_QWORD *)off_6F00DF8 + 23);
      *(_QWORD *)(v52 + 8) = v50;
      ((void (__fastcall *)(__int64, __int64))unk_2E101BC)(v52 + 8, v50);
    }
    v53 = ((__int64 (__fastcall *)(__int64, __int64, __int64))unk_425E078)(a4, v50, qword_6F42350);
    v48 = ((__int64 (__fastcall *)(__int64, __int64))unk_426AA40)(v53, qword_6F434B8);
  }
  v54 = *(_QWORD *)(a1 + 232);
  if ( !v54
    || (v55 = (*(__int64 (__fastcall **)(_QWORD, _QWORD))(v54 + 24))(*(_QWORD *)(v54 + 64), *(_QWORD *)(v54 + 40)),
        (v56 = *(_QWORD *)(a1 + 352)) == 0) )
  {
LABEL_42:
    ((void (*)(void))unk_2E1049C)();
    JUMPOUT(0x30E14AC);
  }
  v57 = *(_QWORD *)(v56 + 128);
  v58 = v55;
  if ( !v57 )
  {
    v59 = 0.0;
    if ( v55 )
      goto LABEL_40;
    goto LABEL_42;
  }
  v59 = *(float *)(v57 + 48);
  if ( !v55 )
    goto LABEL_42;
LABEL_40:
  v60 = OneFrameData__Setup(
          v55,
          *(_DWORD *)(v31 + 16),
          v48,
          v24,
          v23,
          a3,
          a2,
          v22,
          v26,
          v29,
          v32,
          v36,
          v59,
          v66,
          *(_DWORD *)(v31 + 88),
          v67,
          a6);
  v61 = *(_QWORD *)(a1 + 224);
  v62 = *(unsigned __int8 *)(a1 + 196);
  v63 = (*(__int64 (__fastcall **)(__int64, _QWORD, float))(*(_QWORD *)a1 + 680LL))(
          a1,
          *(_QWORD *)(*(_QWORD *)a1 + 688LL),
          v60);
  if ( !v61 )
    goto LABEL_42;
  (*(void (__fastcall **)(_QWORD, __int64, bool, _QWORD, _QWORD))(v61 + 24))(
    *(_QWORD *)(v61 + 64),
    v58,
    v62 != 0,
    v63,
    *(_QWORD *)(v61 + 40));
  return (*(__int64 (__fastcall **)(__int64, _QWORD, _QWORD))(*(_QWORD *)a1 + 424LL))(
           a1,
           v22,
           *(_QWORD *)(*(_QWORD *)a1 + 432LL));
}
