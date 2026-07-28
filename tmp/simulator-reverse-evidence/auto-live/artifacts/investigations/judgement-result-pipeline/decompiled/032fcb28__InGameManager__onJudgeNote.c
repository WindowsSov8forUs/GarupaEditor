// corrected-entry: 0x32fcb28
// corrected-end: 0x32fccd0
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall InGameManager__onJudgeNote(_QWORD *a1, __int64 a2, char a3, unsigned int a4)
{
  __int64 v8; // x8
  __int64 v9; // x0
  unsigned int v10; // w2
  __int64 result; // x0
  __int64 *v12; // x23
  __int64 v13; // x24
  __int64 v14; // x8
  unsigned int v15; // w26
  unsigned int v16; // w25
  __int64 v17; // x9
  _DWORD *v18; // x10
  __int64 v19; // x0
  _DWORD *v20; // x8
  int v21; // w9
  int v22; // w10

  if ( (byte_7252B3F & 1) == 0 )
  {
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6EEE0B8);
    byte_7252B3F = 1;
  }
  if ( !a2 )
    goto LABEL_25;
  if ( !*(_DWORD *)(a2 + 52) )
  {
    v8 = a1[16];
    if ( !v8 )
      goto LABEL_25;
    ((void (__fastcall *)(_QWORD, _QWORD, _QWORD))unk_33DBDDC)(*(_QWORD *)(v8 + 128), 0, 0);
  }
  v9 = a1[21];
  if ( !v9 )
    goto LABEL_25;
  if ( (((__int64 (__fastcall *)(__int64, _QWORD, _QWORD, _QWORD, _QWORD))unk_32F3A24)(
          v9,
          *(unsigned int *)(a2 + 72),
          *(unsigned int *)(a2 + 44),
          *(unsigned int *)(a2 + 52),
          a4)
      & 1) == 0
    && (((__int64 (__fastcall *)(_QWORD *))unk_32F9224)(a1) & 1) == 0 )
  {
    v10 = *(_DWORD *)(a2 + 44);
    if ( v10 <= 0xA && ((1 << v10) & 0x6E8) != 0 )
      ((void (__fastcall *)(_QWORD *, _QWORD))unk_32FCCD0)(a1, *(unsigned int *)(a2 + 52));
    else
      ((void (__fastcall *)(_QWORD *, _QWORD))unk_32FCE98)(a1, *(unsigned int *)(a2 + 52));
  }
  result = ((__int64 (__fastcall *)(_QWORD *))unk_32F9224)(a1);
  if ( (result & 1) != 0 )
    goto LABEL_22;
  v12 = (__int64 *)a1[24];
  if ( !v12 )
  {
LABEL_25:
    ((void (*)(void))unk_2E1049C)();
    JUMPOUT(0x32FCCD0);
  }
  v13 = *(_QWORD *)(a2 + 24);
  v14 = *v12;
  v15 = *(_DWORD *)(a2 + 44);
  v16 = *(_DWORD *)(a2 + 52);
  v17 = *(unsigned __int16 *)(*v12 + 302);
  if ( *(_WORD *)(*v12 + 302) )
  {
    v18 = (_DWORD *)(*(_QWORD *)(v14 + 176) + 8LL);
    while ( *((_QWORD *)v18 - 1) != qword_6EEE0B8 )
    {
      --v17;
      v18 += 4;
      if ( !v17 )
        goto LABEL_19;
    }
    v19 = v14 + 16LL * (*v18 + 22) + 312;
  }
  else
  {
LABEL_19:
    v19 = ((__int64 (__fastcall *)(_QWORD, __int64, __int64))unk_2DA9E1C)(a1[24], qword_6EEE0B8, 22);
  }
  result = (*(__int64 (__fastcall **)(__int64 *, __int64, _QWORD, _QWORD, _QWORD, _QWORD))v19)(
             v12,
             v13,
             v15,
             v16,
             a3 & 1,
             *(_QWORD *)(v19 + 8));
LABEL_22:
  v20 = (_DWORD *)a1[21];
  if ( !v20 )
    goto LABEL_25;
  v21 = *(_DWORD *)(a2 + 72);
  v22 = *(_DWORD *)(a2 + 52);
  v20[4] = *(_DWORD *)(a2 + 44);
  v20[5] = a4;
  v20[6] = v21;
  v20[7] = v22;
  v20[8] = 3;
  return result;
}
