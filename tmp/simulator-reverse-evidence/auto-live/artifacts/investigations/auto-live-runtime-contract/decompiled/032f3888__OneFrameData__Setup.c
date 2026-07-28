// corrected-entry: 0x32f3888
// corrected-end: 0x32f3974
// boundary-source: IL2CPP metadata RVA adjacency

float __fastcall OneFrameData__Setup(
        __int64 a1,
        int a2,
        __int64 a3,
        int a4,
        int a5,
        int a6,
        int a7,
        int a8,
        float a9,
        float a10,
        float a11,
        float a12,
        float a13,
        int a14,
        int a15,
        int a16,
        int a17)
{
  __int64 v17; // x25
  int v29; // w8

  *(_QWORD *)(a1 + 24) = a3;
  v17 = a1 + 24;
  *(_DWORD *)(a1 + 20) = a2;
  *(_BYTE *)(a1 + 16) = 1;
  ((void (__fastcall *)(__int64, __int64))unk_2E101BC)(a1 + 24, a3);
  *(float *)(v17 + 8) = a9;
  *(float *)(v17 + 60) = a10;
  *(_DWORD *)(v17 + 12) = a4;
  *(_DWORD *)(v17 + 16) = a5;
  *(_DWORD *)(v17 + 20) = a6;
  *(_DWORD *)(v17 + 24) = a7;
  *(_DWORD *)(v17 + 28) = a8;
  *(float *)(v17 + 32) = a11;
  *(float *)(v17 + 36) = a12;
  *(float *)(v17 + 40) = a13;
  *(_DWORD *)(v17 + 44) = a14;
  *(_DWORD *)(v17 + 48) = a15;
  *(_DWORD *)(v17 + 52) = a16;
  if ( (a8 | 4) == 4 )
    v29 = 0;
  else
    v29 = a17;
  *(_DWORD *)(a1 + 80) = v29;
  *(float *)(a1 + 88) = a11 * a12;
  return a11 * a12;
}
