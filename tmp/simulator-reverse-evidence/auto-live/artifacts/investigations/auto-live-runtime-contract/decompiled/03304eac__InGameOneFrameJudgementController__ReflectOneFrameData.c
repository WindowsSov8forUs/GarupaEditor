// corrected-entry: 0x3304eac
// corrected-end: 0x33053b8
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall InGameOneFrameJudgementController__ReflectOneFrameData(
        _QWORD *a1,
        char a2,
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
        __int64 a13,
        __int64 a14,
        __int64 a15,
        __int64 a16,
        __int64 a17,
        __int64 a18)
{
  long double v18; // q8
  __int64 result; // x0
  __int64 v21; // x0
  unsigned int v22; // w21
  unsigned int v23; // w20
  unsigned int v24; // w22
  unsigned int v25; // w28
  unsigned int v26; // w23
  int v27; // w29
  int v28; // w25
  __int64 v29; // x0
  __int64 v30; // x26
  int v31; // w8
  int v32; // w8
  __int64 v33; // x0
  __int64 v34; // x8
  __int64 v35; // x0
  __int64 v36; // x8
  unsigned int v37; // w0
  __int64 v38; // x8
  float v39; // s0
  float v40; // s3
  __int64 v41; // x8
  float v42; // s1
  unsigned int v43; // w9
  float v44; // s1
  float v45; // s0
  unsigned int v46; // w27
  unsigned int v47; // w9
  float v48; // s0
  unsigned int v49; // w24
  unsigned int v50; // w25
  unsigned int v51; // w22
  unsigned int v52; // w28
  unsigned int v53; // w23
  __int64 v54; // x20
  __int64 v55; // x21
  __int64 v56; // x0
  __int64 v57; // x0
  unsigned int v58; // w0
  float v59; // s0
  unsigned int v60; // w9
  __int64 v61; // x0
  __int64 v62; // x0
  __int64 v63; // x8
  __int64 v64; // x8
  __int64 v65; // x0
  __int64 v66; // x0
  __int64 v67; // x8
  __int64 v68; // x8
  __int64 v69; // x9
  __int64 v70; // x0
  __int64 v71; // x8
  __int64 v72; // x9
  __int64 v73; // x0
  __int64 *v74; // x24
  __int64 v75; // x9
  __int64 v76; // x8
  unsigned int v77; // w26
  __int64 v78; // x9
  _DWORD *v79; // x10
  __int64 v80; // x0
  __int64 v81; // x7
  int v82; // [xsp+20h] [xbp+20h]
  unsigned int v84; // [xsp+34h] [xbp+34h]
  int v85; // [xsp+38h] [xbp+38h]
  unsigned int v86; // [xsp+3Ch] [xbp+3Ch]

  LOBYTE(a18) = a2;
  if ( (byte_7252B87 & 1) == 0 )
  {
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6EEE0B8);
    ((void (__fastcall *)(void *))unk_2E10210)(&unk_6F280C0);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F280C8);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F32DA8);
    byte_7252B87 = 1;
  }
  HIDWORD(a18) = 0;
  result = ((__int64 (__fastcall *)(_QWORD *))unk_3304E04)(a1);
  if ( (result & 1) != 0 )
  {
    v21 = a1[12];
    if ( v21 )
    {
      v22 = 0;
      v23 = 0;
      v24 = 0;
      v25 = 0;
      v26 = 0;
      v86 = 0;
      v27 = 0;
      LODWORD(v18) = 0;
      v28 = -1;
      v82 = -1;
      while ( v27 < *(_DWORD *)(v21 + 24) )
      {
        v29 = ((__int64 (*)(void))unk_5768734)();
        if ( !v29 )
          goto LABEL_89;
        v30 = v29;
        if ( *(_BYTE *)(v29 + 16) )
        {
          v31 = *(_DWORD *)(v29 + 48);
          *(_BYTE *)(v29 + 16) = 0;
          if ( v28 < v31 )
          {
            v26 = *(_DWORD *)(v29 + 68);
            v28 = v31;
            v82 = *(_DWORD *)(v29 + 52);
          }
          v32 = *(_DWORD *)(v29 + 76);
          v33 = a1[2];
          if ( v32 == 1 )
            v25 = 1;
          if ( !v33 )
            goto LABEL_89;
          ((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_32F35E8)(v33, *(unsigned int *)(v30 + 40), 0);
          if ( (a18 & 1) == 0 )
          {
            if ( !a4 )
              goto LABEL_89;
            (*(void (__fastcall **)(_QWORD, _QWORD, _QWORD))(a4 + 24))(
              *(_QWORD *)(a4 + 64),
              *(unsigned int *)(v30 + 52),
              *(_QWORD *)(a4 + 40));
          }
          v34 = a1[2];
          if ( !v34 )
            goto LABEL_89;
          v35 = a1[4];
          if ( !v35 )
            goto LABEL_89;
          ((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_32F6024)(v35, *(unsigned int *)(v34 + 52), 0);
          v24 += *(_DWORD *)(v30 + 36);
          if ( *(_DWORD *)(v30 + 76) == 2 )
          {
            v36 = a1[2];
            if ( !v36 )
              goto LABEL_89;
            if ( *(int *)(v36 + 32) >= 1 )
            {
              v37 = ((__int64 (*)(void))unk_33DBC00)();
              v38 = a1[2];
              if ( !v38 )
                goto LABEL_89;
              v25 = v37;
              v24 = ((__int64 (__fastcall *)(_QWORD, _QWORD, _QWORD))unk_33DBBE8)(*(unsigned int *)(v38 + 32), v24, 0);
            }
          }
          v39 = ((float (__fastcall *)(_QWORD *, __int64))unk_33053B8)(a1, v30);
          v40 = *(float *)(v30 + 88);
          v41 = a1[3];
          v42 = v39 * *(float *)(v30 + 32);
          v43 = (int)v42;
          if ( v42 >= 0.0 )
            v43 = (unsigned int)v42;
          v44 = v40 * (float)v43;
          v45 = v39 * *(float *)(v30 + 84);
          if ( v44 >= 0.0 )
            v46 = (unsigned int)v44;
          else
            v46 = (int)v44;
          v47 = (unsigned int)v45;
          if ( v45 < 0.0 )
            v47 = (int)v45;
          v48 = v40 * (float)v47;
          v49 = v48 >= 0.0 ? (unsigned int)v48 : (int)v48;
          if ( !v41 )
            goto LABEL_89;
          if ( *(_DWORD *)(v41 + 16) == 5 )
          {
            v84 = v25;
            v85 = v28;
            HIDWORD(a18) = 0;
            v50 = v24;
            v51 = v26;
            v52 = v22;
            v53 = v23;
            v54 = a1[8];
            v55 = a1[2];
            v56 = ((__int64 (__fastcall *)(__int64))unk_497C258)(qword_6F32DA8);
            if ( !v56 )
              goto LABEL_89;
            v57 = *(_QWORD *)(v56 + 48);
            if ( !v57 )
              goto LABEL_89;
            v58 = (*(__int64 (__fastcall **)(__int64, _QWORD))(*(_QWORD *)v57 + 376LL))(
                    v57,
                    *(_QWORD *)(*(_QWORD *)v57 + 384LL));
            if ( !v54 )
              goto LABEL_89;
            v59 = ((float (__fastcall *)(__int64, __int64, __int64, _QWORD, char *, _QWORD))unk_3A6B288)(
                    v54,
                    v30,
                    v55,
                    v58,
                    (char *)&a18 + 4,
                    0)
                * (float)v46;
            if ( v59 >= 0.0 )
              v46 = (unsigned int)v59;
            else
              v46 = (int)v59;
            v60 = v86;
            v23 = v53;
            v22 = v52;
            v26 = v51;
            v24 = v50;
            v25 = v84;
            v28 = v85;
            if ( HIDWORD(a18) > v86 )
              v60 = HIDWORD(a18);
            v86 = v60;
          }
          v61 = a1[2];
          if ( !v61 )
            goto LABEL_89;
          ((void (__fastcall *)(__int64, _QWORD, __int64, _QWORD))unk_32F3334)(v61, v46, v30, 0);
          v62 = a1[2];
          if ( !v62 )
            goto LABEL_89;
          ((void (__fastcall *)(__int64, _QWORD, __int64, _QWORD))unk_32F342C)(v62, v49, v30, 0);
          v63 = a1[3];
          if ( !v63 )
            goto LABEL_89;
          if ( !*(_BYTE *)(v63 + 184) )
          {
            if ( !a1[6] )
              goto LABEL_89;
            if ( (((__int64 (*)(void))unk_33054BC)() & 1) != 0 && (a18 & 1) == 0 )
            {
              v64 = a1[6];
              if ( !v64 )
                goto LABEL_89;
              v65 = *(_QWORD *)(v64 + 144);
              if ( !v65 )
                goto LABEL_89;
              ((void (__fastcall *)(__int64, _QWORD, _QWORD, _QWORD))unk_387AC94)(v65, v46, v26, 0);
            }
          }
          if ( (*(_DWORD *)(v30 + 52) & 0x80000000) == 0 )
          {
            if ( !a1[2] )
              goto LABEL_89;
            ((void (*)(void))unk_32F365C)();
            v66 = a1[2];
            if ( !v66 )
              goto LABEL_89;
            ((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_32F3784)(v66, *(unsigned int *)(v30 + 80), 0);
          }
          v22 += v46;
          v23 += v49;
          if ( v26 == 5 )
            *(float *)&v18 = *(float *)(v30 + 64) + 100.0;
        }
        v21 = a1[12];
        ++v27;
        if ( !v21 )
          goto LABEL_89;
      }
      if ( (a18 & 1) != 0 )
        goto LABEL_84;
      v67 = a1[3];
      if ( v67 )
      {
        if ( *(_BYTE *)(v67 + 225)
          || (v68 = a1[2]) != 0
          && (v69 = a1[6]) != 0
          && (v70 = *(_QWORD *)(v69 + 40)) != 0
          && (((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_396DCAC)(v70, *(unsigned int *)(v68 + 52), 0),
              (v67 = a1[3]) != 0) )
        {
          if ( !*(_BYTE *)(v67 + 392) )
          {
            v71 = a1[2];
            if ( !v71 )
              goto LABEL_89;
            v72 = a1[6];
            if ( !v72 )
              goto LABEL_89;
            v73 = *(_QWORD *)(v72 + 48);
            if ( !v73 )
              goto LABEL_89;
            ((void (__fastcall *)(__int64, _QWORD, _QWORD))unk_396DAE0)(v73, *(unsigned int *)(v71 + 52), 0);
          }
          v74 = (__int64 *)a1[5];
          if ( !v74 )
          {
LABEL_84:
            if ( v82 >= 2 )
              v81 = 0;
            else
              v81 = v25;
            return sub_32F39BC(a1 + 13, v22, v23, v24, (unsigned int)v28, (unsigned int)v82, v26, v81, v18);
          }
          v75 = a1[2];
          if ( v75 )
          {
            v76 = *v74;
            v77 = *(_DWORD *)(v75 + 52);
            v78 = *(unsigned __int16 *)(*v74 + 302);
            if ( *(_WORD *)(*v74 + 302) )
            {
              v79 = (_DWORD *)(*(_QWORD *)(v76 + 176) + 8LL);
              while ( *((_QWORD *)v79 - 1) != qword_6EEE0B8 )
              {
                --v78;
                v79 += 4;
                if ( !v78 )
                  goto LABEL_81;
              }
              v80 = v76 + 16LL * (*v79 + 23) + 312;
            }
            else
            {
LABEL_81:
              v80 = ((__int64 (__fastcall *)(_QWORD, __int64, __int64))unk_2DA9E1C)(a1[5], qword_6EEE0B8, 23);
            }
            (*(void (__fastcall **)(__int64 *, _QWORD, _QWORD))v80)(v74, v77, *(_QWORD *)(v80 + 8));
            goto LABEL_84;
          }
        }
      }
    }
LABEL_89:
    ((void (*)(void))unk_2E1049C)();
    JUMPOUT(0x33053B8);
  }
  return result;
}
