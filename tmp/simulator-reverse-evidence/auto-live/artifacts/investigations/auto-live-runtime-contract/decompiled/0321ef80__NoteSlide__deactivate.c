// RHYTHM_C_SLICE_BEGIN	rva=0x321ef80	target=0x321ef80=NoteSlide.deactivate	owner=NoteSlide	method=deactivate	domain=note
// target: 0x321ef80=NoteSlide.deactivate
// display-name: NoteSlide.deactivate
// function: NoteSlide.deactivate
// entry: 0331ef80


/* WARNING: Possible PIC construction at 0x0331f0b0: Changing call to branch */
/* WARNING: Removing unreachable block (ram,0x0331f0b4) */

void NoteSlide_deactivate(long param_1)

{
  ulong *puVar1;
  char cVar2;
  bool bVar3;
  undefined *puVar4;
  undefined *puVar5;
  long lVar6;
  long *plVar7;
  ulong uVar8;
  int iVar9;

  if ((bRam0000000007352267 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d967d8);
    func_0x02f10210(PTR_DAT_06d967e8);
    func_0x02f10210(PTR_DAT_06d82bd8);
    bRam0000000007352267 = 1;
  }
  func_0x031e0740(param_1,0);
  puVar5 = PTR_DAT_06d967e8;
  puVar4 = PTR_DAT_06d82bd8;
  lVar6 = *(long *)(param_1 + 0x1b8);
  if (lVar6 != 0) {
    iVar9 = 0;
    do {
      if (*(int *)(lVar6 + 0x18) <= iVar9) goto SUB_02f101bc;
      plVar7 = (long *)func_0x05868734(lVar6,iVar9,*(undefined8 *)puVar5);
      if (*(int *)(*(long *)puVar4 + 0xe0) == 0) {
        func_0x02f10384(*(long *)puVar4);
      }
      uVar8 = func_0x066c1880(plVar7,0);
      if ((uVar8 & 1) != 0) {
        if (plVar7 == (long *)0x0) break;
        (**(code **)(*plVar7 + 0x288))(plVar7,*(undefined8 *)(*plVar7 + 0x290));
        (**(code **)(*plVar7 + 0x298))(plVar7,*(undefined8 *)(*plVar7 + 0x2a0));
        *(undefined4 *)((long)plVar7 + 0x1dc) = 0xffffffff;
        (**(code **)(*plVar7 + 0x278))(plVar7,*(undefined8 *)(*plVar7 + 0x280));
      }
      lVar6 = *(long *)(param_1 + 0x1b8);
      iVar9 = iVar9 + 1;
    } while (lVar6 != 0);
  }
  func_0x02f1049c();
SUB_02f101bc:
  NoteSlide_FadeoutSlideNoteSound(param_1);
  func_0x0331b818(param_1);
  func_0x0331b85c(param_1);
  *(undefined8 *)(param_1 + 0x198) = 0;
  if (iRam0000000007582c30 != 0) {
    puVar1 = (ulong *)((param_1 + 0x198U >> 0x12 & 0x7fff) * 8 + 0x73b6c08);
    do {
      cVar2 = '\x01';
      bVar3 = (bool)ExclusiveMonitorPass(puVar1,0x10);
      if (bVar3) {
        *puVar1 = *puVar1 | 1L << (param_1 + 0x198U >> 0xc & 0x3f);
        cVar2 = ExclusiveMonitorsStatus();
      }
    } while (cVar2 != '\0');
  }
  return;
}
// RHYTHM_C_SLICE_END	rva=0x321ef80
