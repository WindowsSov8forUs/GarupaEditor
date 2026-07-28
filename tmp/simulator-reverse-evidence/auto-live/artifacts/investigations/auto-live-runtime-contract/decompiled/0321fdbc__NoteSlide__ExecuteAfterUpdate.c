// corrected-entry: 0x321fdbc
// corrected-end: 0x321fe40
// boundary-source: IL2CPP metadata RVA adjacency

__int64 __fastcall NoteSlide__ExecuteAfterUpdate(__int64 a1)
{
  __int64 v2; // x0

  if ( (byte_7252262 & 1) == 0 )
  {
    ((void (__fastcall *)(void *))unk_2E10210)(&unk_6F27F78);
    ((void (__fastcall *)(__int64 *))unk_2E10210)(&qword_6F27F80);
    byte_7252262 = 1;
  }
  NoteBase__ExecuteAfterUpdate(a1);
  if ( !*(_QWORD *)(a1 + 440) || (v2 = ((__int64 (*)(void))unk_5768734)()) == 0 )
  {
    ((void (*)(void))unk_2E1049C)();
    JUMPOUT(0x321FE40);
  }
  return (*(__int64 (__fastcall **)(__int64, _QWORD))(*(_QWORD *)v2 + 536LL))(v2, *(_QWORD *)(*(_QWORD *)v2 + 544LL));
}
